// The strip shows while a video is open and hides a moment after it closes (src/main/windows/overlay.ts
// stripFollowsVideo); the show/hide key hides it for that video and shows it again.
// Run: node scripts/test-strip-visibility.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-strip-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(fakeElectron, "module.exports = { app: { once() {}, getPath: () => '' }, BrowserWindow: class {}, screen: {} }\n")
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron } })
const { stripFollowsVideo } = await jiti.import('../src/main/windows/overlay.ts')

class FakeStrip extends EventEmitter {
  visible = false
  isDestroyed() { return false }
  isVisible() { return this.visible }
  showInactive() { this.visible = true }
  hide() { this.visible = false }
  setAlwaysOnTop() { this.onTop = true }
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const watcher = Object.assign(new EventEmitter(), { currentVideo: undefined })
const strip = new FakeStrip()
const shown = stripFollowsVideo(strip, watcher)

strip.emit('ready-to-show')
assert.equal(strip.visible, false, 'no video at start: no strip')
watcher.emit('video', { id: 'a' })
assert.equal(strip.visible, true, 'a video opens: the strip shows')
watcher.emit('video', undefined)
assert.equal(strip.visible, true, 'it waits a moment after the video closes')
watcher.emit('video', { id: 'b' })
await sleep(1700)
assert.equal(strip.visible, true, 'a page changing (closed, then a video again) never hid it')
watcher.emit('video', undefined)
await sleep(1700)
assert.equal(strip.visible, false, 'the video closed: the strip hid')

watcher.emit('video', { id: 'c' })
shown.toggle()
assert.equal(strip.visible, false, 'the key hides it')
watcher.emit('video', { id: 'd' })
assert.equal(strip.visible, false, 'and it stays hidden while watching')
shown.toggle()
assert.equal(strip.visible, true, 'the key shows it again')
watcher.emit('video', undefined)
await sleep(1700)
watcher.emit('video', { id: 'e' })
assert.equal(strip.visible, true, 'after leaving, the next video shows it again')

watcher.emit('video', undefined)
await sleep(1700)
shown.show()
assert.equal(strip.visible, true, 'Talk brings it up with no video')
console.log('Strip visibility tests passed.')
process.exit(0)
