// Checks which line the strip shows (overlay/useOverlay.ts chooseLine). Run: npx jiti scripts/test-overlay.mjs
import { chooseLine } from '../src/renderer/src/overlay/useOverlay.ts'

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
state = chooseLine(line(2, 'failed'), [line(1, 'ready'), line(2, 'failed')], { id: 1, ...here }, here)
check(state.current?.id === 2 && state.next?.id === 2, 'a failed line should show, not stay hidden behind the old one')
// Switching language drops the kept line.
state = chooseLine(line(5, 'pending'), [line(1, 'ready'), line(5, 'pending')], { id: 1, ...here }, { ...here, language: 'ja' })
check(state.current?.id === 5, 'a line from the old language should not stay after switching')
// A new video drops it too.
state = chooseLine(undefined, [line(1, 'ready')], { id: 1, ...here }, { ...here, url: 'https://youtube.com/watch?v=b' })
check(state.current === undefined, 'a line from the old video should not stay')
// Remembered value is stable when nothing changed (no render loop).
const kept = { id: 1, ...here }
check(chooseLine(line(1, 'ready'), [line(1, 'ready')], kept, here).next === kept, 'unchanged state should be returned as is')

console.log('Overlay line choice test passed.')
