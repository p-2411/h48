// Where the strip sits (src/main/placement.ts): it follows the video as it moves or goes full screen;
// a click on the strip (opening it, a checkpoint) leaves it following; only a real drag pins it.
// Run: node scripts/test-placement.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-placement-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const { EventEmitter } = require('node:events')
const area = { x: 0, y: 25, width: 1440, height: 875 }
module.exports = {
  cursor: { x: 0, y: 0 },
  app: { once() {}, getPath: () => ${JSON.stringify(folder)}, isPackaged: false },
  screen: {
    getCursorScreenPoint: () => ({ ...module.exports.cursor }),
    getDisplayNearestPoint: () => ({ workArea: area }),
    getPrimaryDisplay: () => ({ workArea: area }),
    getAllDisplays: () => [{ workArea: area }]
  },
  BrowserWindow: class {},
  nativeTheme: new EventEmitter(),
  is: { dev: false }
}
`
)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron } })
const electron = await jiti.import(fakeElectron)
const { Placement } = await jiti.import('../src/main/placement.ts')

const window = {
  bounds: { x: 0, y: 0, width: 900, height: 598 },
  webContents: { on: () => undefined },
  isDestroyed: () => false,
  getBounds() { return { ...this.bounds } },
  setBounds(bounds) { this.bounds = { ...bounds } }
}
const saved = []
const settings = { current: {}, update: (change) => saved.push(change) }
const placement = new Placement(window, settings, () => {})
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const middle = () => window.bounds.x + window.bounds.width / 2

placement.setVideo('https://www.youtube.com/watch?v=abc')
placement.setFrame({ x: 100, y: 100, width: 800, height: 450 })
assert.equal(middle(), 500, 'on the video, centred')

// A click: pressed and let go where it was.
Object.assign(electron.cursor, { x: 500, y: 500 })
placement.drag('start')
await sleep(40)
placement.drag('end')
placement.setFrame({ x: 0, y: 25, width: 1440, height: 875 })
assert.equal(middle(), 720, 'after a click it still follows the video (full screen)')
assert.equal(saved.length, 0, 'a click saves no place')

// A drag: the pointer moves the strip.
Object.assign(electron.cursor, { x: 720, y: 800 })
placement.drag('start')
Object.assign(electron.cursor, { x: 420, y: 700 })
await sleep(60)
placement.drag('end')
const dropped = middle()
assert.equal(dropped, 420, 'a drag moves it with the pointer')
assert.equal(saved.length, 1, 'and keeps where it was put')
placement.setFrame({ x: 100, y: 100, width: 800, height: 450 })
assert.equal(middle(), dropped, 'a dragged strip stays put on this video')
placement.setVideo('https://www.youtube.com/watch?v=next')
assert.equal(middle(), 500, 'the next video snaps it back on')
console.log('Placement tests passed.')
process.exit(0)
