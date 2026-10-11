// The System Audio Recording permission.
//
// macOS asks about this permission, and remembers the answer, for the "responsible" process: by
// default whatever launched us (Electron, a terminal). So the reader first relaunches itself as its
// own responsible process; its identity and the reason it gives come from the Info.plist built into
// the binary. Asking and checking go through TCC, the system's privacy service (the same calls
// Apple's AudioCap sample uses), because Core Audio has no public call that shows the prompt.
import Darwin
import Foundation

typealias DisclaimFunction = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32

/** Relaunches this program as its own responsible process, passing stdin and stdout through, and
 * exits with its status. Returns at once in the relaunched copy (or if relaunching isn't possible). */
func runAsResponsibleProcess() {
  guard ProcessInfo.processInfo.environment["DUET_RESPONSIBLE"] == nil,
        let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim") else { return }
  let disclaim = unsafeBitCast(symbol, to: DisclaimFunction.self)
  var attributes: posix_spawnattr_t?
  posix_spawnattr_init(&attributes)
  _ = disclaim(&attributes, 1)
  setenv("DUET_RESPONSIBLE", "1", 1)
  var pid: pid_t = 0
  guard posix_spawn(&pid, CommandLine.unsafeArgv[0], nil, &attributes, CommandLine.unsafeArgv, environ) == 0 else { return }
  // If the app goes away, take the child with us.
  signal(SIGTERM) { _ in exit(0) }
  var status: Int32 = 0
  waitpid(pid, &status, 0)
  exit((status >> 8) & 0xff)
}

typealias PreflightFunction = @convention(c) (CFString, CFDictionary?) -> Int
typealias RequestFunction = @convention(c) (CFString, CFDictionary?, @escaping @convention(block) (Bool) -> Void) -> Void

private let tcc = dlopen("/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC", RTLD_NOW)
private let service = "kTCCServiceAudioCapture" as CFString

enum Permission: String { case granted, denied, notAsked = "not-asked", unknown }

func audioPermission() -> Permission {
  guard let tcc, let symbol = dlsym(tcc, "TCCAccessPreflight") else { return .unknown }
  switch unsafeBitCast(symbol, to: PreflightFunction.self)(service, nil) {
  case 0: return .granted
  case 1: return .denied
  default: return .notAsked
  }
}

/** Shows the system prompt (only the first time) and calls back with the answer. */
func requestAudioPermission(_ done: @escaping (Bool) -> Void) {
  guard let tcc, let symbol = dlsym(tcc, "TCCAccessRequest") else { return done(false) }
  unsafeBitCast(symbol, to: RequestFunction.self)(service, nil) { granted in done(granted) }
}
