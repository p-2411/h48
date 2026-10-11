// Duet caption reader for macOS.
//
// Reads the caption text YouTube and Netflix draw over the video, through the macOS accessibility
// layer, from Chromium browsers (Chrome, Arc, Edge, Brave). Browsers expose page text this way for
// screen readers; Duet needs the Accessibility permission (System Settings > Privacy & Security >
// Accessibility) to read it.
//
// Output: one JSON object per line on stdout, the same protocol as the Windows reader:
//   {"type":"status","trusted":true,"browser":"Google Chrome","url":"https://…","captions":true}
//   {"type":"caption","text":"…","url":"https://…","browser":"Google Chrome","at":1791701575123}
//   {"type":"time","t":112,"playing":true,"ad":false,"url":"https://…","at":1791701575123}
// A status line is sent whenever any of its fields change; a caption line whenever the visible
// caption text changes (an empty text means the caption cleared); a time line whenever the player's
// position (whole seconds), play state or ad state changes. Deciding when a line is finished, and
// the time between whole seconds, is left to the app.
//
// Input: one JSON object per line on stdin, from the app:
//   {"type":"pause"} / {"type":"play"}   presses the player's play button if the video is not
//                                        already in that state
//   {"type":"seek","seconds":107.25,"from":335.4}   moves the video to that point, through the seek
//                                        bar; "from" is where the app's clock says the video is
//                                        (the bar's own value can be stale while controls hide)
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

// Where each site draws its captions: the class on the caption container, and the class on the
// pieces of caption text inside it (nil means "all text inside the container"). Chrome often
// exposes caption text directly inside the caption window, without the inner span's class, so
// both sites read all text in the container.
// `captionsButton` is the player's CC button, whose label says when the video has no captions.
// `player` carries the play and ad state in its classes; `progress` is the seek bar, whose value is
// the position in seconds.
struct Site {
  let host: String; let container: String; let segment: String?; let captionsButton: String?
  var player: String? = nil; var progress: String? = nil; var playButton: String? = nil
}
let sites = [
  Site(host: "youtube.com", container: "ytp-caption-window-container", segment: nil, captionsButton: "ytp-subtitles-button",
       player: "html5-video-player", progress: "ytp-progress-bar", playButton: "ytp-play-button"),
  Site(host: "netflix.com", container: "player-timedtext", segment: nil, captionsButton: nil),
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
struct Target { let app: AXUIElement; let browser: String; let page: AXUIElement; let url: String; let site: Site }

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
      return Target(app: element, browser: browsers[app.bundleIdentifier ?? ""] ?? "Browser", page: page, url: address, site: site)
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
  guard depth < 8 else { return }
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
    status(["type": "status", "trusted": true, "captions": false])
    if lastText != nil && lastText != "" { lastText = ""; emit(["type": "caption", "text": "", "at": Date().timeIntervalSince1970 * 1000]) }
    return
  }
  if container == nil || containerURL != current.url || ticks % 20 == 0 {
    let site = current.site
    let found = findAll(current.page, budget: searchBudget, classNames: [site.container, site.player, site.progress, site.playButton].compactMap { $0 })
    container = found[site.container]
    player = site.player.flatMap { found[$0] }
    progress = site.progress.flatMap { found[$0] }
    playButton = site.playButton.flatMap { found[$0] }
    containerURL = current.url
    available = seenTextOn == current.url || captionsAvailable(current.page, site: current.site)
  }
  status(["type": "status", "trusted": true, "browser": current.browser, "url": current.url,
          "captions": container != nil, "available": available])
  let text = container.map { captionText($0, site: current.site) } ?? ""
  // Caption text on screen proves the video has captions, whatever the CC button's label says.
  if !text.isEmpty { seenTextOn = current.url }
  if !text.isEmpty && !available {
    available = true
    status(["type": "status", "trusted": true, "browser": current.browser, "url": current.url,
            "captions": true, "available": true])
  }
  if let bar = progress, let seconds = number(bar, kAXValueAttribute) {
    let modes = player.map(classes) ?? []
    let fields: [String: AnyHashable] = ["t": seconds, "playing": modes.contains("playing-mode"), "ad": modes.contains("ad-showing"),
                                         "url": current.url]
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

// Seeking: set the seek bar's value; if the page ignores that, step with the bar's own decrement
// and increment actions (5 seconds each on YouTube, like the arrow keys), landing just before.
let stepSeconds = 5.0
func seek(to seconds: Double, from position: Double?) {
  guard let bar = progress, let before = number(bar, kAXValueAttribute) else { return }
  AXUIElementSetAttributeValue(bar, kAXValueAttribute as CFString, NSNumber(value: seconds))
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
    // The set worked if the bar moved (towards the target); otherwise step from the best position known.
    guard let now = number(bar, kAXValueAttribute), abs(now - seconds) > 1.5, abs(now - before) < 1.5 else { return }
    let distance = seconds - (position ?? now)
    let steps = Int((abs(distance) / stepSeconds).rounded(distance < 0 ? .up : .down))
    let action = (distance < 0 ? kAXDecrementAction : kAXIncrementAction) as CFString
    for _ in 0..<steps { AXUIElementPerformAction(bar, action) }
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
        guard let button = playButton, let modes = player.map(classes) else { return }
        if modes.contains("playing-mode") == (type == "pause") { AXUIElementPerformAction(button, kAXPressAction as CFString) }
      case "seek":
        if let seconds = object["seconds"] as? Double { seek(to: seconds, from: object["from"] as? Double) }
      default:
        break
      }
    }
  }
}

RunLoop.main.run()
