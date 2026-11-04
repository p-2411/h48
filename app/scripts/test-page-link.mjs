// The companion extension's link (src/main/page-link.ts): exact times and playback speed in the
// clock (clock.ts), the watcher preferring them over the seek bar and sending commands through the
// page, only extensions allowed to connect, and lines processed several chunks at a time
// (session.ts) so a seek starts at once without dropping chunks still useful.
// Run: npx jiti scripts/test-page-link.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJiti } from 'jiti'
import WebSocket from 'ws'

const folder = mkdtempSync(join(tmpdir(), 'duet-link-'))
const fakeElectron = join(folder, 'electron.cjs')
writeFileSync(fakeElectron, 'module.exports = { app: {}, is: { dev: false } }\n')
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron } })
const { PlayerClock } = await jiti.import('../src/main/clock.ts')
const { Player } = await jiti.import('../src/main/player.ts')
const { Watcher } = await jiti.import('../src/main/watcher.ts')
const { LineSession } = await jiti.import('../src/main/session.ts')
const { PageLink } = await jiti.import('../src/main/page-link.ts')

globalThis.fetch = async () => {
  throw new Error('offline in tests')
}
const settle = () => new Promise((done) => setImmediate(done))
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} vs ${b}`)

// --- The clock takes exact times as they are, and runs at the playback rate. ---
{
  const clock = new PlayerClock()
  const at = 1_000_000
  clock.update({ t: 10.37, playing: true, ad: false, at, exact: true, rate: 1.25 })
  close(clock.now(at + 2000), 12.87, 'at 1.25x, 2 s of real time is 2.5 s of video')
  clock.update({ t: 40, playing: true, ad: false, at: at + 3000, exact: true, rate: 1 })
  close(clock.now(at + 3000), 40, 'an exact whole second is not taken for the middle of one')
  clock.update({ t: 40.5, playing: false, ad: false, at: at + 4000, exact: true, rate: 1 })
  close(clock.now(at + 9000), 40.5, 'paused, it stands still')
  // The seek bar (no rate) still runs at normal speed, as before.
  const bar = new PlayerClock()
  bar.update({ t: 5, playing: true, ad: false, at })
  close(bar.now(at + 1000), 6.5, 'the seek bar’s whole seconds still mean the middle of the second')
}

// --- The watcher prefers the extension's time, and sends commands through it. ---
{
  const url = 'https://www.youtube.com/watch?v=abcdefghijk'
  const captions = Object.assign(new EventEmitter(), { sent: [], command(c) { this.sent.push(c.type) } })
  const link = Object.assign(new EventEmitter(), {
    sent: [],
    command(matches, c) {
      if (!matches(url)) return false
      this.sent.push(c.type)
      return true
    }
  })
  const settings = Object.assign(new EventEmitter(), { current: { language: 'es' } })
  let watcher
  const player = new Player((command) => watcher.command(command))
  const steady = { name: 'fake', processLines: async ({ lines }) => lines.map((l) => ({ translation: l, source: [], english: [] })) }
  watcher = new Watcher(captions, player, settings, steady, undefined, link)
  captions.emit('status', { trusted: true, url, title: 'A video - YouTube', captions: false })

  // Without the extension, the seek bar's time is used, and commands go to the reader.
  captions.emit('time', { t: 29, playing: true, ad: false, at: Date.now() })
  close(player.now(), 29.5, 'the reader’s time while there is no extension')
  watcher.command({ type: 'pause' })
  assert.deepEqual(captions.sent, ['pause'], 'commands go to the reader without the extension')

  // The extension reports: its time wins, and the stale seek bar is ignored.
  link.emit('time', { url, t: 71.25, playing: true, ad: false, rate: 1, at: Date.now(), exact: true })
  close(player.now(), 71.25, 'the extension’s exact time')
  captions.emit('time', { t: 29, playing: true, ad: false, at: Date.now() })
  close(player.now(), 71.25, 'the stale seek bar no longer moves the clock')
  watcher.command({ type: 'seek', seconds: 12, play: true })
  assert.deepEqual(link.sent, ['seek'], 'commands go through the page while it is linked')

  // Another video's report changes nothing.
  link.emit('time', { url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz', t: 5, playing: true, ad: false, rate: 1, at: Date.now(), exact: true })
  close(player.now(), 71.25, 'another tab’s video is ignored')
}

// --- Only extensions may connect; their reports come through as exact times. ---
{
  const PORT = 47900 + Math.floor(Math.random() * 90)
  const link = new PageLink(PORT)
  link.start()
  await new Promise((done) => setTimeout(done, 100))
  const got = new Promise((done) => link.once('time', done))
  const extension = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: 'chrome-extension://abcdef' })
  await new Promise((done, fail) => extension.on('open', done).on('error', fail))
  extension.send(JSON.stringify({ type: 'time', url: 'https://www.youtube.com/watch?v=abcdefghijk', t: 12.5, playing: true, rate: 1.5, ad: false, at: Date.now() }))
  const time = await got
  assert.equal(time.t, 12.5)
  assert.equal(time.rate, 1.5)
  assert.equal(time.exact, true)
  const commands = new Promise((done) => extension.once('message', (data) => done(JSON.parse(String(data)))))
  assert.equal(link.command((u) => u.includes('abcdefghijk'), { type: 'pause' }), true)
  assert.deepEqual(await commands, { type: 'pause' }, 'the page gets the command')
  const site = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: 'https://example.com' })
  const refused = await new Promise((done) => site.on('open', () => done(false)).on('error', () => done(true)))
  assert.equal(refused, true, 'a web page may not connect')
  extension.close()
  link.stop()
}

// --- Several chunks at once; a seek starts at once and keeps chunks still useful. ---
{
  const asked = []
  const model = {
    name: 'fake',
    processLines: ({ lines }, signal) => {
      const entry = { lines, signal }
      asked.push(entry)
      return new Promise((done) => (entry.done = () => done(lines.map((l) => ({ translation: l, source: [], english: [] })))))
    }
  }
  const session = new LineSession(model, 'es')
  session.loadTranscript(Array.from({ length: 200 }, (_, i) => ({ text: `línea ${i}`, start: i * 2, end: i * 2 + 2 })))
  session.setTime(0)
  await settle()
  assert.deepEqual(asked.map((a) => a.lines.length), [3, 6, 12], 'three chunks start at once, growing with the lead')
  assert.equal(asked[1].lines[0], 'línea 3', 'the second chunk follows the first')

  // A short rewind-free move along keeps them all.
  session.setTime(4)
  await settle()
  assert.equal(asked.filter((a) => a.signal.aborted).length, 0, 'chunks ahead of the video carry on')

  // A seek far ahead drops what is now behind and starts there at once.
  session.setTime(300)
  await settle()
  assert.equal(asked.slice(0, 3).every((a) => a.signal.aborted), true, 'chunks left behind are dropped')
  assert.equal(asked[3]?.lines[0], 'línea 150', 'processing starts where the video now is')
  assert.equal(asked.length, 6, 'with its three chunks at once')

  // Finishing a chunk starts the next one.
  asked[3].done()
  await settle()
  await settle()
  assert.equal(session.script.lines[150].state, 'ready')
  assert.equal(asked.length, 7, 'a finished chunk makes room for the next')
}

// --- Following a transcript, captions on screen in another language raise no notice. ---
{
  const realFetch = globalThis.fetch
  // YouTube answers: the watch page, the player (one Japanese track), the track itself.
  globalThis.fetch = async (url) => {
    const text = (body) => ({ ok: true, text: async () => body, json: async () => JSON.parse(body) })
    if (String(url).includes('/watch?v=')) return text('"INNERTUBE_API_KEY": "key"')
    if (String(url).includes('/player')) return text(JSON.stringify({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://yt/track', languageCode: 'ja' }] } } }))
    return text('<text start="0" dur="2">こんにちは。はじめ社長です。</text><text start="2" dur="2">近所に家がありました。</text>')
  }
  const url = 'https://www.youtube.com/watch?v=abcdefghijk'
  const captions = Object.assign(new EventEmitter(), { command() {} })
  const settings = Object.assign(new EventEmitter(), { current: { language: 'ja' } })
  const player = new Player(() => undefined)
  const steady = { name: 'fake', processLines: async ({ lines }) => lines.map((l) => ({ translation: l, source: [], english: [] })) }
  const watcher = new Watcher(captions, player, settings, steady)
  captions.emit('status', { trusted: true, url, title: 'A video - YouTube', captions: true })
  for (let i = 0; i < 10 && watcher.status.source !== 'transcript'; i++) await settle()
  assert.equal(watcher.status.source, 'transcript', 'the transcript is followed')
  for (const line of ['Hello, I am the president.', 'There was a house near my place.', 'So I went to have a look at it.'])
    captions.emit('line', { text: line, at: Date.now() })
  assert.equal(watcher.status.otherLanguage, undefined, 'English captions on screen don’t ask to change them')
  globalThis.fetch = realFetch
}

console.log('page link: all checks passed')
process.exit(0)
