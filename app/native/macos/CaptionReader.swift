// Duet caption reader for macOS.
//
// Reads the caption text YouTube and Netflix draw over the video, through the macOS accessibility
// layer, from Chromium browsers (Chrome, Arc, Edge, Brave). Browsers expose page text this way for
// screen readers; Duet needs the Accessibility permission (System Settings > Privacy & Security >
// Accessibility) to read it.
//
// Output: one JSON object per line on stdout, the same protocol as the Windows reader:
//   {"type":"status","trusted":true,"browser":"Google Chrome","bundle":"com.google.Chrome","url":"https://…","title":"…","captions":true}
//   {"type":"caption","text":"…","url":"https://…","browser":"Google Chrome","at":1791701575123}
//   {"type":"time","t":112,"playing":true,"ad":false,"url":"https://…","at":1791701575123}
//   {"type":"frame","x":120,"y":160,"width":1280,"height":720}   where the video is on screen, in
//                                        screen points from the top left of the main display; just
//                                        {"type":"frame"} when no video is in view
// A status line is sent whenever any of its fields change; a caption line whenever the visible
// caption text changes (an empty text means the caption cleared); a time line whenever the player's
// position (whole seconds), play state or ad state changes; a frame line whenever the video moves,
// changes size, or goes out of view (mostly scrolled off the page counts as out). Deciding when a line is finished, and
// the time between whole seconds, is left to the app.
//
// Input: one JSON object per line on stdin, from the app:
//   {"type":"pause"} / {"type":"play"}   presses the player's play button if the video is not
//                                        already in that state
//   {"type":"seek","seconds":107.25,"from":335.4,"play":true}   moves the video to that point,
//                                        through the seek bar, landing on or just before it; "from" is
//                                        where the app's clock says the video is (the bar's own value
//                                        can be stale while controls hide); "play" plays it once there
// Only on sites whose entry below names the elements needed (YouTube so far).
//
// Build: swiftc -O native/macos/CaptionReader.swift -o resources/bin/caption-reader-macos

import ApplicationServices
import Cocoa

// Chromium-based browsers whose web content is exposed with DOM class names.
let browsers: [String: String] = [
  "com.google.Chrome": "Google Chrome",
  "com.google.Chrome.canary": "Google Chrome Canary",
  "company.thebrowser.Browser": "Arc",
  "com.microsoft.edgemac": "Microsoft Edge",
  "com.brave.Browser": "Brave",
]

// Where each site draws its captions: the class on the caption container, and the class of the
// elements inside it that hold subtitle text (nil means "all text inside the container"). Only text
// inside those counts, so nothing else the player puts in the caption area is taken for a line. On
// YouTube that is each caption window (Chrome exposes the text directly inside it, without the
// inner spans' classes).
// `captionsButton` is the player's CC button, whose label says when the video has no captions.
// `video` is the class of the element that frames the video; nil means the page itself (Netflix's
// watch page is all video).
//
// The player's controls are found one of two ways:
// - by class (YouTube): `player` carries the play and ad state in its classes; `progress` is the seek
//   bar, whose value is the position in seconds; `playButton` toggles play.
// - by label (Netflix, whose class names are scrambled): `labels` names the seek slider, the play
//   and pause button and the 10-second seek buttons as the player labels them. They only exist while
//   the controls show (when the mouse moves over the video); the app's clock runs on in between.
struct LabelControls {
  let slider: String; let play: String; let pause: String; let back: String; let forward: String
  /** The slider's value times this is seconds. */
  let scale: Double
  /** Seconds one press of back or forward moves. */
  let step: Double
}
struct Site {
  let host: String; let container: String; let segment: String?; let captionsButton: String?
  var video: String? = nil
  var player: String? = nil; var progress: String? = nil; var playButton: String? = nil
  var labels: LabelControls? = nil
}
let sites = [
  Site(host: "youtube.com", container: "ytp-caption-window-container", segment: "caption-window", captionsButton: "ytp-subtitles-button",
       video: "html5-video-player", player: "html5-video-player", progress: "ytp-progress-bar", playButton: "ytp-play-button"),
  Site(host: "netflix.com", container: "player-timedtext", segment: nil, captionsButton: nil,
       labels: LabelControls(slider: "Seek time scrubber", play: "Play", pause: "Pause", back: "Seek back", forward: "Seek forward",
                             scale: 0.001, step: 10)),
]

let pollInterval = 0.15
let searchBudget = 20000  // most nodes visited when looking for the caption container

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

func value(_ element: AXUIElement, _ name: String) -> AnyObject? {
  var result: AnyObject?
  return AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success ? result : nil
}
func children(_ element: AXUIElement) -> [AXUIElement] { (value(element, kAXChildrenAttribute) as? [AXUIElement]) ?? [] }
func role(_ element: AXUIElement) -> String { (value(element, kAXRoleAttribute) as? String) ?? "" }
func classes(_ element: AXUIElement) -> [String] { (value(element, "AXDOMClassList") as? [String]) ?? [] }
/** What a control is called: its accessibility description, or its title. */
func label(_ element: AXUIElement) -> String {
  (value(element, kAXDescriptionAttribute) as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (value(element, kAXTitleAttribute) as? String) ?? ""
}
func url(_ element: AXUIElement) -> String? {
  if let link = value(element, "AXURL") as? URL { return link.absoluteString }
  return value(element, "AXURL") as? String
}

// Breadth-first search with a node budget, so a huge page can't stall a poll.
func find(_ root: AXUIElement, budget: Int, where match: (AXUIElement) -> Bool) -> AXUIElement? {
  var queue = [root]
  var visited = 0
  while !queue.isEmpty && visited < budget {
    let element = queue.removeFirst()
    visited += 1
    if match(element) { return element }
    queue.append(contentsOf: children(element))
  }
  return nil
}

// One search for several elements at once, by DOM class.
func findAll(_ root: AXUIElement, budget: Int, classNames: [String]) -> [String: AXUIElement] {
  var found: [String: AXUIElement] = [:]
  var queue = [root]
  var visited = 0
  while !queue.isEmpty && visited < budget && found.count < classNames.count {
    let element = queue.removeFirst()
    visited += 1
    let own = classes(element)
    for name in classNames where found[name] == nil && own.contains(name) { found[name] = element }
    queue.append(contentsOf: children(element))
  }
  return found
}

/** Where an element is on screen, in points from the top left of the main display. */
func frame(_ element: AXUIElement) -> CGRect? {
  guard let position = value(element, kAXPositionAttribute), let size = value(element, kAXSizeAttribute) else { return nil }
  var origin = CGPoint.zero, extent = CGSize.zero
  guard AXValueGetValue(position as! AXValue, .cgPoint, &origin), AXValueGetValue(size as! AXValue, .cgSize, &extent) else { return nil }
  return CGRect(origin: origin, size: extent)
}

func number(_ element: AXUIElement, _ name: String) -> Double? {
  let raw = value(element, name)
  return (raw as? NSNumber)?.doubleValue ?? (raw as? String).flatMap { Double($0) }
}

// The caption's text: the segment pieces joined in order, or every static text inside.
func captionText(_ container: AXUIElement, site: Site) -> String {
  var pieces: [String] = []
  func walk(_ element: AXUIElement, inSegment: Bool) {
    let isSegment = site.segment.map { classes(element).contains($0) } ?? true
    if role(element) == kAXStaticTextRole as String, inSegment || isSegment,
       let text = value(element, kAXValueAttribute) as? String {
      pieces.append(text)
    }
    for child in children(element) { walk(child, inSegment: inSegment || isSegment) }
  }
  walk(container, inSegment: site.segment == nil)
  return pieces.joined(separator: " ")
    .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
}

// What the reader is looking at right now.
struct Target { let app: AXUIElement; let browser: String; let bundle: String; let page: AXUIElement; let url: String; let title: String; let site: Site }

var enabledApps = Set<pid_t>()
func target() -> Target? {
  let running = NSWorkspace.shared.runningApplications.filter { browsers[$0.bundleIdentifier ?? ""] != nil }
  // Prefer the frontmost browser, then any other.
  let ordered = running.sorted { a, _ in a.isActive }
  for app in ordered {
    let element = AXUIElementCreateApplication(app.processIdentifier)
    if !enabledApps.contains(app.processIdentifier) {
      // Chromium builds its web accessibility tree only when asked.
      AXUIElementSetAttributeValue(element, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
      AXUIElementSetAttributeValue(element, "AXManualAccessibility" as CFString, kCFBooleanTrue)
      enabledApps.insert(app.processIdentifier)
    }
    let windows = (value(element, kAXWindowsAttribute) as? [AXUIElement]) ?? []
    for window in windows {
      guard let page = find(window, budget: 600, where: { role($0) == "AXWebArea" }),
            let address = url(page),
            let site = sites.first(where: { address.contains($0.host) }) else { continue }
      return Target(app: element, browser: browsers[app.bundleIdentifier ?? ""] ?? "Browser", bundle: app.bundleIdentifier ?? "", page: page, url: address,
                    title: (value(window, kAXTitleAttribute) as? String) ?? "", site: site)
    }
  }
  return nil
}

var lastStatus: [String: AnyHashable] = [:]
func status(_ fields: [String: AnyHashable]) {
  guard fields != lastStatus else { return }
  lastStatus = fields
  emit(fields)
}

let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
if !trusted {
  status(["type": "status", "trusted": false])
}

// --dump [class]: print what the browser exposes inside the caption area (or the element with that
// DOM class), then exit. For finding where a site keeps something when the reader comes back empty.
func dump(_ element: AXUIElement, depth: Int = 0) {
  guard depth < 20 else { return }
  let indent = String(repeating: "  ", count: depth)
  let text = [kAXValueAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueDescriptionAttribute as String]
    .compactMap { name -> String? in
      let raw = value(element, name)
      return (raw as? String) ?? (raw as? NSNumber).map { "\(name)=\($0)" }
    }.filter { !$0.isEmpty }
  print("\(indent)\(role(element)) classes=\(classes(element)) text=\(text)")
  for child in children(element) { dump(child, depth: depth + 1) }
}
if CommandLine.arguments.contains("--dump") {
  guard AXIsProcessTrusted(), let current = target() else { print("No trusted target page found."); exit(1) }
  let arguments = CommandLine.arguments
  let wanted = arguments.firstIndex(of: "--dump").flatMap { $0 + 1 < arguments.count ? arguments[$0 + 1] : nil } ?? current.site.container
  guard let area = find(current.page, budget: searchBudget, where: { classes($0).contains(wanted) }) else {
    print("No \(wanted) on \(current.url)"); exit(1)
  }
  dump(area)
  exit(0)
}

// False when the player says this video has no captions at all.
func captionsAvailable(_ page: AXUIElement, site: Site) -> Bool {
  guard let name = site.captionsButton,
        let button = find(page, budget: searchBudget, where: { classes($0).contains(name) }) else { return true }
  let label = [kAXDescriptionAttribute, kAXTitleAttribute, kAXHelpAttribute]
    .compactMap { value(button, $0) as? String }.joined(separator: " ").lowercased()
  return !label.contains("unavailable")
}

var container: AXUIElement?
var player: AXUIElement?
var progress: AXUIElement?
var playButton: AXUIElement?
// Controls found by label (see LabelControls).
var slider: AXUIElement?
var playPause: AXUIElement?
var backButton: AXUIElement?
var forwardButton: AXUIElement?

/** Finds the controls a site names by label; they may not exist while the controls are hidden. */
func findLabelled(_ page: AXUIElement, _ labels: LabelControls) {
  slider = nil; playPause = nil; backButton = nil; forwardButton = nil
  var queue = [page]
  var visited = 0
  while !queue.isEmpty && visited < searchBudget {
    let element = queue.removeFirst()
    visited += 1
    let kind = role(element)
    if kind == kAXSliderRole as String || kind == kAXButtonRole as String {
      let name = label(element)
      if kind == kAXSliderRole as String, name.contains(labels.slider) { slider = element }
      else if name == labels.play || name == labels.pause { playPause = element }
      else if name == labels.back { backButton = element }
      else if name == labels.forward { forwardButton = element }
    }
    queue.append(contentsOf: children(element))
  }
}

/** Position (seconds) and play state from a site's controls, when they can be read now. */
func playerState(_ site: Site) -> (seconds: Double, playing: Bool, ad: Bool)? {
  if let labels = site.labels {
    guard let bar = slider, let raw = number(bar, kAXValueAttribute), let button = playPause else { return nil }
    return (raw * labels.scale, label(button) == labels.pause, false)
  }
  guard let bar = progress, let seconds = number(bar, kAXValueAttribute) else { return nil }
  let modes = player.map(classes) ?? []
  return (seconds, modes.contains("playing-mode"), modes.contains("ad-showing"))
}

var currentSite: Site?
var lastFrame: [String: AnyHashable] = ["type": "frame"]
/** Sends where the video is, when that changed: nil when there is none, or most of it is scrolled out of the page. */
func reportFrame(_ video: CGRect?, page: CGRect?) {
  var fields: [String: AnyHashable] = ["type": "frame"]
  if let video, let page {
    let seen = video.intersection(page)
    if !seen.isNull, seen.height >= video.height * 0.5, video.width >= 200, video.height >= 120 {
      fields.merge(["x": Int(video.minX.rounded()), "y": Int(video.minY.rounded()), "width": Int(video.width.rounded()), "height": Int(video.height.rounded())]) { a, _ in a }
    }
  }
  guard fields != lastFrame else { return }
  lastFrame = fields
  emit(fields)
}
var videoElement: AXUIElement?
var lastTime: [String: AnyHashable] = [:]
var containerURL = ""
var available = true
// Set once caption text has appeared on the current video; then the CC label is no longer asked.
var seenTextOn = ""
var lastText: String?
var ticks = 0

Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { _ in
  guard AXIsProcessTrusted() else {
    status(["type": "status", "trusted": false])
    return
  }
  ticks += 1
  // Looking up the page is the slow part; do it a few times a second, not every poll.
  guard let current = target() else {
    container = nil
    videoElement = nil
    reportFrame(nil, page: nil)
    status(["type": "status", "trusted": true, "captions": false])
    if lastText != nil && lastText != "" { lastText = ""; emit(["type": "caption", "text": "", "at": Date().timeIntervalSince1970 * 1000]) }
    return
  }
  currentSite = current.site
  // Labelled controls come and go with the mouse, so look for them more often (the page is small).
  if let labels = current.site.labels, slider == nil || ticks % 4 == 0 { findLabelled(current.page, labels) }
  if container == nil || containerURL != current.url || ticks % 20 == 0 {
    let site = current.site
    let found = findAll(current.page, budget: searchBudget, classNames: [site.container, site.video, site.player, site.progress, site.playButton].compactMap { $0 })
    container = found[site.container]
    videoElement = site.video.map { found[$0] } ?? current.page
    player = site.player.flatMap { found[$0] }
    progress = site.progress.flatMap { found[$0] }
    playButton = site.playButton.flatMap { found[$0] }
    containerURL = current.url
    available = seenTextOn == current.url || captionsAvailable(current.page, site: current.site)
  }
  // Netflix removes its caption area between lines, so captions count as on once seen on this video.
  status(["type": "status", "trusted": true, "browser": current.browser, "bundle": current.bundle, "url": current.url,
          "title": current.title, "captions": container != nil || seenTextOn == current.url, "available": available])
  reportFrame(videoElement.flatMap(frame), page: frame(current.page))
  let text = container.map { captionText($0, site: current.site) } ?? ""
  // Caption text on screen proves the video has captions, whatever the CC button's label says.
  if !text.isEmpty { seenTextOn = current.url }
  if !text.isEmpty && !available {
    available = true
    status(["type": "status", "trusted": true, "browser": current.browser, "bundle": current.bundle, "url": current.url,
            "title": current.title, "captions": true, "available": true])
  }
  if let state = playerState(current.site) {
    // Whole seconds, like YouTube's bar: the app's clock works out the time in between.
    let fields: [String: AnyHashable] = ["t": state.seconds.rounded(.down), "playing": state.playing, "ad": state.ad, "url": current.url]
    if fields != lastTime {
      lastTime = fields
      emit(fields.merging(["type": "time", "at": Date().timeIntervalSince1970 * 1000]) { a, _ in a })
    }
  }
  if text != lastText {
    lastText = text
    emit(["type": "caption", "text": text, "url": current.url, "browser": current.browser, "at": Date().timeIntervalSince1970 * 1000])
  }
}

/** Presses the player's play button if the video is not already in the state asked for (it toggles). */
func press(play: Bool) {
  guard let site = currentSite, let state = playerState(site),
        let button = site.labels != nil ? playPause : playButton else { return }
  if state.playing != play { AXUIElementPerformAction(button, kAXPressAction as CFString) }
}

// Seeking: set the seek bar's value; if the page ignores that, step with the bar's own decrement
// and increment actions (5 seconds each on YouTube, like the arrow keys). Going back always lands
// on or before the point, however close it is (a replay must hear the line's start); going forward
// lands just before, and a little short is close enough.
let stepSeconds = 5.0
func steps(_ distance: Double, of size: Double) -> Int {
  if distance < -0.3 { return Int((-distance / size).rounded(.up)) }
  if distance > 1.5 { return Int((distance / size).rounded(.down)) }
  return 0
}
func seek(to seconds: Double, from position: Double?, thenPlay play: Bool) {
  if let labels = currentSite?.labels {
    // Netflix: step with its 10-second buttons.
    if let now = position ?? playerState(currentSite!).map({ $0.seconds }) {
      let distance = seconds - now
      if let button = distance < 0 ? backButton : forwardButton {
        for _ in 0..<steps(distance, of: labels.step) { AXUIElementPerformAction(button, kAXPressAction as CFString) }
      }
    }
    if play { press(play: true) }
    return
  }
  guard let bar = progress, let before = number(bar, kAXValueAttribute) else {
    if play { press(play: true) }
    return
  }
  AXUIElementSetAttributeValue(bar, kAXValueAttribute as CFString, NSNumber(value: seconds))
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
    // The set worked if the bar moved towards the point; otherwise step from the best position known.
    if let now = number(bar, kAXValueAttribute), abs(before - seconds) > 0.3, abs(now - seconds) >= abs(before - seconds) - 0.5 {
      let distance = seconds - (position ?? now)
      let action = (distance < 0 ? kAXDecrementAction : kAXIncrementAction) as CFString
      for _ in 0..<steps(distance, of: stepSeconds) { AXUIElementPerformAction(bar, action) }
    }
    if play { press(play: true) }
  }
}

// Commands from the app. The play button toggles, so it is pressed only when the video is not
// already in the state asked for.
FileHandle.standardInput.readabilityHandler = { handle in
  let data = handle.availableData
  guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
  for line in text.split(separator: "\n") {
    guard let object = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
          let type = object["type"] as? String else { continue }
    DispatchQueue.main.async {
      switch type {
      case "pause", "play":
        press(play: type == "play")
      case "seek":
        if let seconds = object["seconds"] as? Double {
          seek(to: seconds, from: object["from"] as? Double, thenPlay: object["play"] as? Bool ?? false)
        }
      default:
        break
      }
    }
  }
}

RunLoop.main.run()
