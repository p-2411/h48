// Checks the strip's state: which line it shows (overlay/useOverlay.ts chooseLine), the status dot
// (overlay/notice.ts statusDot) and the settings upgrade (main/upgrade-settings.ts).
// Run: npx jiti scripts/test-overlay.mjs
import { chooseLine } from '../src/renderer/src/overlay/useOverlay.ts'
import { statusDot } from '../src/renderer/src/overlay/notice.ts'
import { upgradeSettings } from '../src/main/upgrade-settings.ts'

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

console.log('Overlay line choice, status dot and settings upgrade tests passed.')
