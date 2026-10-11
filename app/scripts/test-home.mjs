// Tests the home base's main-process side (src/main/home): its window, what it tells the page
// (today, videos watched) and opening a video from Watching, with a small fake "electron" module
// and a temporary database. Run: node scripts/test-home.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-home-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const { EventEmitter } = require('node:events')
const handlers = new Map()
const listeners = new Map()
const windows = []
const opened = []
class WebContents extends EventEmitter {
  constructor() { super(); this.sent = [] }
  send(channel, value) { this.sent.push([channel, value]) }
  once(event, work) { if (event === 'did-finish-load') work(); return this }
}
class BrowserWindow extends EventEmitter {
  constructor(options) { super(); this.options = options; this.webContents = new WebContents(); this.destroyed = false; this.shown = 0; this.focused = 0; windows.push(this) }
  loadURL() {}
  loadFile() {}
  once(event, work) { if (event === 'ready-to-show') work(); return this }
  show() { this.shown++ }
  focus() { this.focused++ }
  isDestroyed() { return this.destroyed }
  close() { this.destroyed = true; this.emit('closed') }
}
module.exports = {
  app: { getPath: () => ${JSON.stringify(folder)} },
  ipcMain: { handle: (channel, work) => handlers.set(channel, work), on: (channel, work) => listeners.set(channel, work) },
  shell: { openExternal: (url) => { opened.push(url); return Promise.resolve() } },
  BrowserWindow,
  is: { dev: false },
  handlers, listeners, windows, opened
}
`
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})
const root = resolve('src/main')
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

try {
  const electron = await jiti.import(fakeElectron)
  const { WatchLog } = await jiti.import(join(root, 'watchlog/index.ts'))
  const { Home } = await jiti.import(join(root, 'home/index.ts'))

  // --- Videos watched, newest first ----------------------------------------------------------
  const log = new WatchLog()
  log.noteVideo(
    { site: 'youtube', id: 'old', url: 'https://www.youtube.com/watch?v=old', title: 'Old' },
    'ko',
    30,
    at(2026, 11, 1)
  )
  log.noteVideo(
    { site: 'netflix', id: '81234', url: 'https://www.netflix.com/watch/81234?trackId=1' },
    'ko',
    600.7,
    at(2026, 11, 2)
  )
  const recent = log.recentVideos(10)
  assert.deepEqual(
    recent.map((video) => video.key),
    ['netflix:81234', 'youtube:old'],
    'the video watched last comes first'
  )
  assert.deepEqual(recent[1], {
    key: 'youtube:old',
    site: 'youtube',
    videoId: 'old',
    title: 'Old',
    position: 30,
    lastWatched: at(2026, 11, 1),
    watchedMs: 0
  })
  assert.equal(
    recent[0].title,
    undefined,
    'a video with no title has none (the page names it by its site)'
  )
  assert.equal(log.recentVideos(1).length, 1)

  // --- The window -------------------------------------------------------------------------------
  const cards = Object.assign(new EventEmitter(), { counts: () => ({ due: 3, newAvailable: 2 }) })
  let welcomed = 0
  const settings = new EventEmitter()
  const home = new Home({ log, cards, settings, openWelcome: () => welcomed++ })
  home.open('cards', 'card-1')
  assert.equal(electron.windows.length, 1)
  const window = electron.windows[0]
  assert.deepEqual(
    window.webContents.sent.slice(-2),
    [
      ['home:place', { place: 'cards' }],
      ['cards:show', 'card-1']
    ],
    'Home opens on Cards, on that card (My cards listens for cards:show)'
  )
  home.open('settings')
  assert.equal(electron.windows.length, 1, 'opening again shows the same window')
  assert.ok(window.focused > 0)
  assert.deepEqual(window.webContents.sent.at(-1), ['home:place', { place: 'settings' }])
  cards.emit('changed', { due: 1, newAvailable: 0 })
  assert.deepEqual(
    window.webContents.sent.at(-1),
    ['cards:changed', undefined],
    'card changes reach the page'
  )
  settings.emit('change', { language: 'ko', reminder: '19:00' }, { reminder: '19:00' })
  assert.deepEqual(
    window.webContents.sent.at(-1),
    ['duet:settings', { language: 'ko', reminder: '19:00' }],
    'setting changes reach the page (Settings shows them)'
  )

  // --- What it tells the page -------------------------------------------------------------------
  const fromHome = { sender: window.webContents }
  const fromElsewhere = { sender: new EventEmitter() }
  const today = await electron.handlers.get('home:get-today')(fromHome)
  assert.equal(today.due, 5, 'due now plus new allowed today')
  assert.deepEqual(Object.keys(today.streak).sort(), ['days', 'freezesLeft', 'keptToday'])
  const watching = await electron.handlers.get('home:get-watching')(fromHome)
  assert.equal(watching[0].key, 'netflix:81234')
  assert.equal(
    watching[0].siteName,
    'Netflix',
    "each video names its site (the site's own name, from sources)"
  )

  // --- Opening a video from Watching ------------------------------------------------------------
  // The page names a video it was shown; main builds the address from the record (never one the page
  // sends), at the place the learner left off.
  const openVideo = electron.listeners.get('home:open-video')
  openVideo(fromHome, 'netflix:81234')
  assert.deepEqual(electron.opened, ['https://www.netflix.com/watch/81234?t=600'])
  openVideo(fromHome, 'youtube:old')
  assert.equal(electron.opened.at(-1), 'https://www.youtube.com/watch?v=old&t=30s')
  openVideo(fromHome, 'youtube:never-watched')
  openVideo(fromHome, 'https://evil.example/')
  openVideo(fromHome, 42)
  openVideo(fromElsewhere, 'youtube:old')
  assert.equal(
    electron.opened.length,
    2,
    'only a video on record, asked for by the home page, is opened'
  )

  // Settings opens the welcome window (permissions) again, when the home page asks.
  electron.listeners.get('home:open-welcome')(fromHome)
  electron.listeners.get('home:open-welcome')(fromElsewhere)
  assert.equal(welcomed, 1, 'only the home page opens the welcome window from here')

  window.close()
  home.open()
  assert.equal(electron.windows.length, 2, 'a closed window is made again')
  assert.deepEqual(
    electron.windows[1].webContents.sent.at(-1),
    ['home:place', { place: 'today' }],
    'Today is the default'
  )

  console.log('Home tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
