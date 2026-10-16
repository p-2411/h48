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
  once(event, work) { if (event === 'did-finish-load') { if (module.exports.loading.slow) this.load = work; else work() } return this }
}
class BrowserWindow extends EventEmitter {
  constructor(options) { super(); this.options = options; this.webContents = new WebContents(); this.destroyed = false; this.shown = 0; this.focused = 0; windows.push(this) }
  loadURL() {}
  loadFile() {}
  once(event, work) { if (event === 'ready-to-show') work(); return this }
  show() { this.shown++ }
  focus() { this.focused++ }
  setBackgroundColor(color) { this.background = color }
  setTitleBarOverlay(overlay) { this.overlay = overlay }
  isDestroyed() { return this.destroyed }
  close() { this.destroyed = true; this.emit('closed') }
}
module.exports = {
  app: { getPath: () => ${JSON.stringify(folder)} },
  ipcMain: { handle: (channel, work) => handlers.set(channel, work), on: (channel, work) => listeners.set(channel, work) },
  shell: { openExternal: (url) => { opened.push(url); return Promise.resolve() } },
  BrowserWindow,
  is: { dev: false },
  handlers, listeners, windows, opened, loading: { slow: false }
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
  await assert.rejects(
    async () => electron.handlers.get('home:get-today')(fromElsewhere),
    /not allowed/i,
    'only the home page reads Today'
  )
  await assert.rejects(
    async () => electron.handlers.get('home:get-watching')(fromElsewhere),
    /not allowed/i,
    'only the home page reads Watching'
  )
  const watching = await electron.handlers.get('home:get-watching')(fromHome)
  assert.equal(watching[0].key, 'netflix:81234')
  assert.equal(
    watching[0].siteName,
    'Netflix',
    "each video names its site (the site's own name, from sources)"
  )

  // Home-v2 preferences are owned, validated and persisted independently of caption settings.
  const initialView = electron.handlers.get('home:get-view')(fromHome)
  assert.equal(initialView.appearance, 'light')
  const changedView = electron.handlers.get('home:set-view')(fromHome, {
    appearance: 'dark',
    layout: { open: ['words', 'talk'], split: { duet: 0.7 } }
  })
  assert.equal(changedView.dark, true)
  assert.equal(window.background, '#121313')
  assert.deepEqual(changedView.layout.open, ['words', 'talk'])
  assert.equal(changedView.layout.split.duet, 0.7)
  assert.throws(
    () => electron.handlers.get('home:set-view')(fromElsewhere, { appearance: 'light' }),
    /not allowed/i
  )
  assert.throws(
    () => electron.handlers.get('home:set-view')(fromHome, { appearance: 'rainbow' }),
    /invalid appearance/i
  )
  const { readSetting } = await jiti.import(join(root, 'store/db.ts'))
  assert.equal(readSetting('home-v2').appearance, 'dark')
  electron.handlers.get('home:set-view')(fromHome, { appearance: 'light' })

  // Saved caption summaries use real meanings, counts, positions and ladder states.
  const { Knowledge } = await jiti.import(join(root, 'knowledge/index.ts'))
  const { todayWord, videoLearning } = await jiti.import(join(root, 'home/data.ts'))
  const knowledge = new Knowledge()
  const sample = {
    source: [{ text: 'hola', base: 'hola', job: 'n', pair: 1, space: false }],
    english: [{ text: 'hello', job: 'n', pair: 1, space: false }],
    translation: 'hello'
  }
  log.noteLine('youtube:old', 'es', {
    id: 71,
    state: 'ready',
    original: 'hola',
    start: 29,
    processed: sample
  })
  knowledge.noteSeen('es', sample)
  const word = todayWord('es', knowledge)
  assert.equal(word.word, 'hola')
  assert.equal(word.meaning, 'hello')
  assert.equal(word.seen, 1)
  assert.equal(word.source, 'Old')
  const learned = videoLearning({ ...recent[1], siteName: 'YouTube' }, 'es', knowledge)
  assert.equal(learned.subtitle, 'hola')
  assert.deepEqual(learned.words, [{ key: 'es:hola', word: 'hola', state: 'encountered' }])
  assert.equal(todayWord('ja', knowledge), undefined)
  knowledge.setIgnored('es', 'es:hola', true)
  assert.equal(todayWord('es', knowledge), undefined)
  assert.deepEqual(videoLearning({ ...recent[1], siteName: 'YouTube' }, 'es', knowledge).words, [])

  // --- Opening a video from Watching ------------------------------------------------------------
  // The page names a video it was shown; main builds the address from the record (never one the page
  // sends), at the place the learner left off.
  const openVideo = (event, key) => electron.handlers.get('home:open-video')(event, key)
  await openVideo(fromHome, 'netflix:81234')
  assert.deepEqual(electron.opened, ['https://www.netflix.com/watch/81234?t=600'])
  await openVideo(fromHome, 'youtube:old')
  assert.equal(electron.opened.at(-1), 'https://www.youtube.com/watch?v=old&t=30s')
  // A video not on record says so (the page shows it); another page is refused.
  await assert.rejects(async () => openVideo(fromHome, 'youtube:never-watched'), /open that video/i)
  await assert.rejects(async () => openVideo(fromHome, 'https://evil.example/'), /open that video/i)
  await assert.rejects(async () => openVideo(fromHome, 42), /open that video/i)
  await assert.rejects(async () => openVideo(fromElsewhere, 'youtube:old'), /not allowed/i)
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
  assert.equal(
    electron.windows[1].webContents.sent.find(([channel]) => channel === 'home:place'),
    undefined,
    'opened with no place asked for, it shows the hub'
  )

  // Opened again before the page has loaded (a notification clicked as Duet starts): the page is
  // shown the place asked for last, once it can hear it.
  electron.windows[1].close()
  electron.loading.slow = true
  home.open('today')
  home.open('cards', 'card-2')
  const slow = electron.windows[2]
  assert.deepEqual(slow.webContents.sent, [], 'nothing is sent before the page has loaded')
  slow.webContents.load()
  assert.deepEqual(
    slow.webContents.sent,
    [
      ['home:place', { place: 'cards' }],
      ['cards:show', 'card-2']
    ],
    'the last place asked for, once loaded'
  )
  electron.loading.slow = false

  // The reminder's time is a setting, set from Settings like the others: a time, or none (off);
  // anything else is refused.
  const { connectOverlay } = await jiti.import(join(root, 'ipc/overlay.ts'))
  const changes = []
  const overlaySettings = Object.assign(new EventEmitter(), {
    current: {},
    update: (change) => changes.push(change)
  })
  connectOverlay(
    { isDestroyed: () => false, webContents: { send: () => {} } },
    { watcher: new EventEmitter(), settings: overlaySettings, fit: () => undefined }
  )
  const setReminder = electron.handlers.get('duet:set-reminder')
  await setReminder({}, '19:30')
  await setReminder({}, null)
  await assert.rejects(async () => setReminder({}, '7pm'), /time/i)
  assert.deepEqual(changes, [{ reminder: '19:30' }, { reminder: undefined }])

  // What the streak note says: freezes cover a missed day only while there are some left.
  const { streakNote } = await jiti.import(resolve('src/renderer/src/home/streak.ts'))
  assert.match(
    streakNote({ days: 4, keptToday: false, freezesLeft: 2 }),
    /2 freezes left this week, so a missed day is covered/
  )
  assert.match(streakNote({ days: 4, keptToday: false, freezesLeft: 1 }), /1 freeze left/)
  const none = streakNote({ days: 4, keptToday: true, freezesLeft: 0 })
  assert.ok(
    !/covered/.test(none) && /No freezes left this week/.test(none),
    `no freezes: not covered (${none})`
  )
  assert.equal(
    streakNote({ days: 0, keptToday: false, freezesLeft: 2 }),
    'Finish today’s session to start one.'
  )

  // What opens at launch and from the Dock: the welcome window until it's been through, then home.
  const { openDuet } = await jiti.import(join(root, 'home/index.ts'))
  const opened = []
  const homeSpy = { open: () => opened.push('home') }
  const welcomeSpy = { open: () => opened.push('welcome') }
  openDuet({ onboarded: false, home: homeSpy, welcome: welcomeSpy })
  openDuet({ onboarded: true, home: homeSpy, welcome: welcomeSpy })
  assert.deepEqual(
    opened,
    ['welcome', 'home'],
    'first run: the welcome window, not the home base over it'
  )

  console.log('Home tests passed.')
} finally {
  // Windows cannot remove an open SQLite database. Release the test's handle first.
  const { database } = await jiti.import(join(root, 'store/db.ts'))
  database().close()
  rmSync(folder, { recursive: true, force: true })
}
