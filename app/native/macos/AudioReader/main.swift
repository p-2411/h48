// Duet audio reader for macOS.
//
// Listens to the browser's sound (not the microphone, not other apps) through a Core Audio process
// tap, and keeps the last minute in memory, so that when the learner asks about a line, the app can
// have that line's audio. Nothing is written to disk, and nothing leaves this process unless the
// app asks for a clip. It only listens while the app says a video is being watched.
//
// Needs macOS 14.2+ and the System Audio Recording permission (see Permission.swift).
//
// Protocol: one JSON object per line.
//   stdin  {"type":"listen","bundle":"com.google.Chrome"}   listen to that browser (and its helpers)
//          {"type":"stop"}                                  stop listening
//          {"type":"request"}                               ask for the permission (shows the prompt once)
//          {"type":"clip","id":7,"from":1791…,"to":1791…}   the audio between two times (ms since 1970)
//   stdout {"type":"status","permission":"granted","listening":true}
//          {"type":"clip","id":7,"wav":"<base64 16 kHz mono WAV>","level":0.04}  or  {"type":"clip","id":7,"error":"…"}
//
// Build: see "build:native" in package.json.
import AudioToolbox
import CoreAudio
import Foundation

runAsResponsibleProcess()

let sampleRate = 16_000.0
let keptSeconds = 60.0

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) else { return }
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

// MARK: Core Audio helpers

func systemProperty<T>(_ selector: AudioObjectPropertySelector, _ initial: T, of object: AudioObjectID = AudioObjectID(kAudioObjectSystemObject)) -> T? {
  var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var value = initial
  var size = UInt32(MemoryLayout<T>.size)
  return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr ? value : nil
}

func audioProcesses() -> [AudioObjectID] {
  var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyProcessObjectList, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size) == noErr else { return [] }
  var list = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &list)
  return list
}

func bundleID(of process: AudioObjectID) -> String {
  var address = AudioObjectPropertyAddress(mSelector: kAudioProcessPropertyBundleID, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var value: CFString = "" as CFString
  var size = UInt32(MemoryLayout<CFString>.size)
  let status = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(process, &address, 0, nil, &size, $0) }
  return status == noErr ? value as String : ""
}

// MARK: The last minute of sound, mono, 16 kHz

final class Recording {
  private var samples = [Float](repeating: 0, count: Int(sampleRate * keptSeconds))
  private var written = 0          // samples ever written
  private var newestAt = 0.0       // ms since 1970 of the newest sample
  private let lock = NSLock()
  // Resampling state: position in the source stream, carried between buffers.
  private var sourcePosition = 0.0
  private var previous: Float = 0

  /** Mono samples at `rate`, the newest of them heard at `at`. */
  func append(_ input: UnsafeBufferPointer<Float>, rate: Double, at: Double) {
    lock.lock()
    defer { lock.unlock() }
    let step = rate / sampleRate
    while sourcePosition < Double(input.count) {
      let index = Int(sourcePosition)
      let fraction = Float(sourcePosition - Double(index))
      let before = index == 0 ? previous : input[index - 1]
      let value = before + (input[index] - before) * fraction
      samples[written % samples.count] = value
      written += 1
      sourcePosition += step
    }
    sourcePosition -= Double(input.count)
    previous = input.last ?? previous
    newestAt = at
  }

  func reset() {
    lock.lock()
    written = 0
    sourcePosition = 0
    lock.unlock()
  }

  /** The samples heard between two times, if they are still kept. */
  func clip(from: Double, to: Double) -> [Float]? {
    lock.lock()
    defer { lock.unlock() }
    guard written > 0 else { return nil }
    let end = written - Int((newestAt - min(to, newestAt)) / 1000 * sampleRate)
    let start = written - Int((newestAt - from) / 1000 * sampleRate)
    let oldest = max(0, written - samples.count)
    guard start >= oldest, end > start else { return nil }
    return (start..<end).map { samples[$0 % samples.count] }
  }
}

func wav(_ samples: [Float]) -> Data {
  var data = Data()
  func append<T>(_ value: T) { withUnsafeBytes(of: value) { data.append(contentsOf: $0) } }
  let rate = UInt32(sampleRate)
  data.append("RIFF".data(using: .ascii)!); append(UInt32(36 + samples.count * 2)); data.append("WAVEfmt ".data(using: .ascii)!)
  append(UInt32(16)); append(UInt16(1)); append(UInt16(1)); append(rate); append(rate * 2); append(UInt16(2)); append(UInt16(16))
  data.append("data".data(using: .ascii)!); append(UInt32(samples.count * 2))
  for sample in samples { append(Int16(max(-1, min(1, sample)) * 32767)) }
  return data
}

// MARK: Listening

final class Listener {
  let recording = Recording()
  private var bundle: String?
  private var tapped: [AudioObjectID] = []
  private var tap = AudioObjectID(kAudioObjectUnknown)
  private var device = AudioObjectID(kAudioObjectUnknown)
  private var proc: AudioDeviceIOProcID?
  private let queue = DispatchQueue(label: "duet.audio")

  var listening: Bool { proc != nil }

  func listen(to bundle: String?) {
    self.bundle = bundle
    refresh()
  }

  /** (Re)builds the tap when the browser's audio processes change, e.g. a helper restarting. */
  func refresh() {
    guard let bundle, audioPermission() == .granted else { return stop() }
    let processes = audioProcesses().filter { bundleID(of: $0).hasPrefix(bundle) }.sorted()
    if processes == tapped && listening { return }
    stop()
    guard !processes.isEmpty else { return }
    let description = CATapDescription(stereoMixdownOfProcesses: processes)
    description.uuid = UUID()
    description.muteBehavior = .unmuted
    description.isPrivate = true
    guard AudioHardwareCreateProcessTap(description, &tap) == noErr,
          let output = systemProperty(kAudioHardwarePropertyDefaultSystemOutputDevice, AudioObjectID(0)),
          let outputUID = systemProperty(kAudioDevicePropertyDeviceUID, "" as CFString, of: output),
          let format = systemProperty(kAudioTapPropertyFormat, AudioStreamBasicDescription(), of: tap) else { return stop() }
    let aggregate: [String: Any] = [
      kAudioAggregateDeviceNameKey: "Duet audio reader",
      kAudioAggregateDeviceUIDKey: UUID().uuidString,
      kAudioAggregateDeviceMainSubDeviceKey: outputUID as String,
      kAudioAggregateDeviceIsPrivateKey: true,
      kAudioAggregateDeviceIsStackedKey: false,
      kAudioAggregateDeviceTapAutoStartKey: true,
      kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID as String]],
      kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: description.uuid.uuidString]],
    ]
    guard AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &device) == noErr else { return stop() }
    let rate = format.mSampleRate
    let recording = self.recording
    var mono: [Float] = []
    let status = AudioDeviceCreateIOProcIDWithBlock(&proc, device, queue) { _, input, _, _, _ in
      let heardAt = Date().timeIntervalSince1970 * 1000
      let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
      guard let first = buffers.first, let data = first.mData else { return }
      let channels = max(Int(first.mNumberChannels), 1)
      let frames = Int(first.mDataByteSize) / (MemoryLayout<Float>.size * channels)
      let pointer = data.assumingMemoryBound(to: Float.self)
      if mono.count != frames { mono = [Float](repeating: 0, count: frames) }
      for frame in 0..<frames {
        var sum: Float = 0
        for channel in 0..<channels { sum += pointer[frame * channels + channel] }
        mono[frame] = sum / Float(channels)
      }
      mono.withUnsafeBufferPointer { recording.append($0, rate: rate, at: heardAt) }
    }
    guard status == noErr, AudioDeviceStart(device, proc) == noErr else { return stop() }
    tapped = processes
  }

  func stop() {
    if let proc {
      AudioDeviceStop(device, proc)
      AudioDeviceDestroyIOProcID(device, proc)
    }
    if device != kAudioObjectUnknown { AudioHardwareDestroyAggregateDevice(device) }
    if tap != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tap) }
    proc = nil
    device = AudioObjectID(kAudioObjectUnknown)
    tap = AudioObjectID(kAudioObjectUnknown)
    tapped = []
    recording.reset()
  }
}

let listener = Listener()
var lastStatus = ""
func reportStatus() {
  let status: [String: Any] = ["type": "status", "permission": audioPermission().rawValue, "listening": listener.listening]
  let key = "\(status["permission"]!)\(status["listening"]!)"
  guard key != lastStatus else { return }
  lastStatus = key
  emit(status)
}

FileHandle.standardInput.readabilityHandler = { handle in
  let data = handle.availableData
  if data.isEmpty { exit(0) }  // the app went away
  for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
    guard let object = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
          let type = object["type"] as? String else { continue }
    DispatchQueue.main.async {
      switch type {
      case "listen": listener.listen(to: object["bundle"] as? String)
      case "stop": listener.listen(to: nil)
      case "request":
        requestAudioPermission { _ in DispatchQueue.main.async { listener.refresh(); reportStatus() } }
      case "clip":
        let id = object["id"] ?? 0
        guard let from = object["from"] as? Double, let to = object["to"] as? Double,
              let samples = listener.recording.clip(from: from, to: to) else {
          return emit(["type": "clip", "id": id, "error": "That part is no longer kept, or nothing was heard."])
        }
        let level = sqrt(samples.reduce(0) { $0 + $1 * $1 } / Float(max(samples.count, 1)))
        emit(["type": "clip", "id": id, "wav": wav(samples).base64EncodedString(), "level": level])
      default: break
      }
      reportStatus()
    }
  }
}

// Browsers start and stop audio helpers; keep the tap on the current set.
Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in
  listener.refresh()
  reportStatus()
}
reportStatus()
RunLoop.main.run()
