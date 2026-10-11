// Checks the strip's state: which line it shows (overlay/useOverlay.ts chooseLine), the status dot
// (overlay/notice.ts statusDot), the settings upgrade (main/upgrade-settings.ts) and the overlay
// window's bounds near the top of the screen (main/windows/overlay-size.ts).
// Run: npx jiti scripts/test-overlay.mjs
import { chooseLine } from '../src/renderer/src/overlay/useOverlay.ts'
import { statusDot } from '../src/renderer/src/overlay/notice.ts'
import { hoverOn } from '../src/renderer/src/overlay/words.ts'
import { WheelSteps } from '../src/renderer/src/overlay/wheel.ts'
import { levelAt } from '../src/renderer/src/overlay/levels.ts'
import { upgradeSettings } from '../src/main/upgrade-settings.ts'
import { settingsChange } from '../src/main/ipc/settings-change.ts'
import { OVERLAY, overlayBounds, stripOnScreen } from '../src/main/windows/overlay-size.ts'

const line = (id, state) => ({ id, original: `line ${id}`, at: id, state })
const here = { url: 'https://youtube.com/watch?v=a', language: 'es' }
const check = (ok, what) => {
  if (!ok) throw new Error(what)
}

// A ready line shows, and is remembered.
let state = chooseLine(line(1, 'ready'), [line(1, 'ready')], undefined, here)
check(state.current?.id === 1 && state.next?.id === 1, 'a ready line should show')
// While the next is pending, the remembered line stays.
const lines = [line(1, 'ready'), line(2, 'pending')]
state = chooseLine(lines[1], lines, state.next, here)
check(state.current?.id === 1, 'the last ready line should stay while the next is translated')
// A failed line replaces it: it is settled, shown as it is.
state = chooseLine(
  line(2, 'failed'),
  [line(1, 'ready'), line(2, 'failed')],
  { id: 1, ...here },
  here
)
check(
  state.current?.id === 2 && state.next?.id === 2,
  'a failed line should show, not stay hidden behind the old one'
)
// Switching language drops the kept line.
state = chooseLine(
  line(5, 'pending'),
  [line(1, 'ready'), line(5, 'pending')],
  { id: 1, ...here },
  { ...here, language: 'ja' }
)
check(state.current?.id === 5, 'a line from the old language should not stay after switching')
// A new video drops it too.
state = chooseLine(
  undefined,
  [line(1, 'ready')],
  { id: 1, ...here },
  { ...here, url: 'https://youtube.com/watch?v=b' }
)
check(state.current === undefined, 'a line from the old video should not stay')
// Remembered value is stable when nothing changed (no render loop).
const kept = { id: 1, ...here }
check(
  chooseLine(line(1, 'ready'), [line(1, 'ready')], kept, here).next === kept,
  'unchanged state should be returned as is'
)

// The status dot: red when something is wrong, yellow while a line translates or forms, green when
// lines come through, grey with no video.
const running = { trusted: true, url: here.url, captions: true, browser: 'Chrome' }
const calm = { translating: false, failed: false, building: false }
const tone = (status, line = {}) => statusDot(status, 'es', { ...calm, ...line }).tone
check(tone(running) === 'ok', 'lines coming through should be green')
check(tone(running, { translating: true }) === 'busy', 'a line translating should be yellow')
check(
  tone({ ...running, waiting: true }) === 'busy',
  'Wait holding the video for a line should be yellow'
)
check(tone(running, { building: true }) === 'busy', 'a line still forming should be yellow')
check(tone(running, { failed: true }) === 'error', 'a line that failed to translate should be red')
check(
  tone({ ...running, modelError: 'No key' }, { translating: true }) === 'error',
  'a model error should be red, even while translating'
)
check(tone({ ...running, trusted: false }) === 'error', 'a missing permission should be red')
check(tone({ trusted: true }) === 'off', 'with no video the dot should be grey')

// A hover belongs to its line: the pointer can rest on the strip while the next line comes, and the
// next line's word with the same pair number was never pointed at.
const resting = { lineId: 1, pair: 2 }
check(hoverOn(resting, 1) === resting, 'a hover on the line shown stays')
check(hoverOn(resting, 2) === undefined, 'a hover from the line before is dropped')
check(hoverOn(undefined, 1) === undefined, 'no hover, none')

// "Pause while explaining" became on by default; settings saved before then are brought up once.
check(
  upgradeSettings({ language: 'ko', pauseForHelp: false }).pauseForHelp === true,
  'old saved settings should pause while explaining'
)
check(
  upgradeSettings({ pauseForHelp: false, version: 2 }).pauseForHelp === false,
  'a choice made since should stand'
)
check(upgradeSettings(undefined) === undefined, 'no saved settings should stay none')

// The strip can go as high as the screen: near the top, the window is cut shorter from its top
// (macOS keeps windows below the menu bar), so the strip at its bottom stays where it was put.
const low = overlayBounds(100, 400, 25)
check(low.y === 400 && low.height === OVERLAY.height, 'well below the top: the whole window')
const high = overlayBounds(100, -300, 25)
check(high.y === 25 && high.y + high.height === -300 + OVERLAY.height, `near the top: cut from the top, strip at the same place (${JSON.stringify(high)})`)
const top = overlayBounds(100, -540, 25)
check(top.y === 25 && top.height >= 120, 'at the very top: still room for the strip')
// A saved place counts as on screen by where the strip is, not the empty top of the window.
const screens = [{ x: 0, y: 25, width: 1440, height: 875 }]
check(stripOnScreen({ x: 100, y: -300 }, screens), 'a strip dragged near the top is on screen')
check(!stripOnScreen({ x: 100, y: 2000 }, screens), 'one below every screen is not')
// A page's settings change keeps only the settings it may set, with values of the right kind.
const changed = settingsChange({ pauseForHelp: false, showFullLine: false, wordScript: 'reading', language: 'xx', shortcut: 'Ctrl+Q' })
check(JSON.stringify(changed) === JSON.stringify({ pauseForHelp: false, showFullLine: false, wordScript: 'reading' }), `only the page's own settings: ${JSON.stringify(changed)}`)
check(JSON.stringify(settingsChange({ showFullLine: 'yes', wordScript: 'cursive' })) === '{}', 'values of the wrong kind are dropped')
check(JSON.stringify(settingsChange(null)) === '{}', 'no change at all')
// Scrolling the level carousel: a swipe's many small scroll events make one step, not many; a
// sideways swipe counts as much as the wheel; scrolling on after a pause steps again.
const wheel = new WheelSteps()
check(wheel.step(10, 0, 1000) === 0, 'a nudge is not a step')
check(wheel.step(15, 0, 1010) === 0, 'still not')
check(wheel.step(20, 0, 1020) === 1, 'enough scrolled: one step on')
check([1030, 1040, 1050, 1060].map((at) => wheel.step(30, 0, at)).every((steps) => steps === 0), 'the same swipe goes on: no more steps')
check(wheel.step(0, -60, 1400) === -1, 'later, a swipe back (sideways): one step back')
check(wheel.step(0, 80, 1450) === 0, 'a swipe straight back the other way waits its turn')
check(wheel.step(0, 80, 1700) === 1, 'then steps')
// The level slider: the level under the pointer, by where it is along the row (26 px a level),
// kept to Auto–5 however far the drag goes.
check(levelAt(0) === 0 && levelAt(25) === 0, 'the first place is Auto')
check(levelAt(26) === 1 && levelAt(60) === 2 && levelAt(155) === 5, 'each 26 px is the next level')
check(levelAt(-40) === 0 && levelAt(400) === 5, 'dragged past either end: the end level')
console.log('Overlay line choice, status dot and settings upgrade tests passed.')
