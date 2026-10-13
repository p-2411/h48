// Where a video's lines come from (src/main/watcher.ts), and what happens to them when the
// translator can't be reached (src/main/session.ts). The best source first: a transcript (YouTube),
// then captions in the language being learnt, then the audio; on sites that listen first (Netflix)
// Duet hears the video at once instead of waiting for captions.
// Run: npx jiti scripts/test-sources.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'node:test'
import { createJiti } from 'jiti'

// The watcher imports Electron's helpers; a stand-in is enough here (not in development).
const folder = mkdtempSync(join(tmpdir(), 'duet-sources-'))
const fakeElectron = join(folder, 'electron.cjs')
writeFileSync(fakeElectron, 'module.exports = { app: {}, is: { dev: false } }\n')
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron }
})
const { LineSession } = await jiti.import('../src/main/session.ts')
const { ModelError } = await jiti.import('../src/main/ai/errors.ts')
const { Watcher } = await jiti.import('../src/main/watcher.ts')
const { sourceFor } = await jiti.import('../src/main/sources/index.ts')

// No real requests: YouTube's transcript fetch fails as if offline.
globalThis.fetch = async () => {
  throw new Error('offline in tests')
}

mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
const settle = () => new Promise((done) => setImmediate(done))
const processed = (text) => ({ translation: `[${text}]`, source: [], english: [] })

try {
  // --- The translator can't be reached: lines wait and are tried again, not failed for good. ---
  let calls = 0
  const flaky = {
    name: 'fake',
    async processLines({ lines }) {
      calls++
      if (calls === 1) throw new ModelError('Could not reach OpenAI.', 'network')
      return lines.map(processed)
    }
  }
  const session = new LineSession(flaky, 'es')
  const notices = []
  session.on('model-error', (message) => notices.push(message))
  session.add('Hola, ¿qué tal?', Date.now())
  await settle()
  const [line] = session.script.lines
  assert.equal(line.state, 'pending', 'a line the translator could not be reached for waits')
  assert.match(notices.at(-1) ?? '', /reach/i, 'the strip says the translator can’t be reached')
  mock.timers.tick(2000)
  await settle()
  await settle()
  assert.equal(calls, 2, 'it is tried again after a moment')
  assert.equal(session.script.lines[0].state, 'ready', 'and translated once the connection is back')
  assert.equal(notices.at(-1), undefined, 'the notice clears once the translator answers')

  // A refusal or bad output is not the connection: those lines fail as before, without a retry.
  const refusing = {
    name: 'fake',
    async processLines() {
      throw new ModelError('The model refused this line.', 'refusal')
    }
  }
  const refused = new LineSession(refusing, 'es')
  refused.add('Hola', Date.now())
  await settle()
  assert.equal(refused.script.lines[0].state, 'failed', 'a refusal still fails the line')

  // --- Where lines come from. ---
  const steady = { name: 'fake', processLines: async ({ lines }) => lines.map(processed) }
  const watcherOn = (url, title) => {
    const captions = new EventEmitter()
    const player = { reset: () => undefined, now: () => undefined, update: () => undefined }
    const settings = Object.assign(new EventEmitter(), { current: { language: 'es' } })
    const watcher = new Watcher(captions, player, settings, steady)
    captions.emit('status', { trusted: true, url, title, captions: false })
    return { watcher, captions }
  }

  // Netflix listens at once: its captions are often off, or in English, or drawn as images.
  const netflix = watcherOn('https://www.netflix.com/watch/81234567', 'Netflix')
  assert.equal(netflix.watcher.needsHearing, true, 'on Netflix Duet hears the video straight away')
  // Captions in the language being learnt take over from the audio.
  netflix.captions.emit('live', { text: 'Hola, ¿cómo estás? Muy bien, gracias por preguntar.' })
  assert.equal(netflix.watcher.needsHearing, false, 'captions in the learnt language take over')
  // Captions in another language don't count: Duet keeps listening once they have gone quiet.
  mock.timers.tick(6001)
  netflix.captions.emit('live', { text: 'Hello, how are you? Very well, thank you for asking.' })
  assert.equal(netflix.watcher.needsHearing, true, 'English captions don’t stop the listening')

  // YouTube waits for its transcript or captions first, and only then listens.
  const youtube = watcherOn('https://www.youtube.com/watch?v=abcdefghijk', 'A video - YouTube')
  assert.equal(youtube.watcher.needsHearing, false, 'YouTube gives its transcript a moment first')
  mock.timers.tick(6001)
  assert.equal(youtube.watcher.needsHearing, true, 'then, with nothing to read, Duet listens')

  // --- Disney+ and Crunchyroll: heard, never read (no captions, no controls). ---
  const play = 'https://www.disneyplus.com/play/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'
  const disney = sourceFor(play)
  assert.equal(disney?.site, 'disneyplus', 'a Disney+ player page is Disney+')
  assert.equal(
    disney.videoId(play),
    '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    'its video id is in the path'
  )
  assert.equal(
    disney.videoId('https://www.disneyplus.com/en-gb/play/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'),
    '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    'with a locale in front too'
  )
  assert.equal(
    disney.videoId('https://www.disneyplus.com/browse/entity-1a2b3c4d'),
    undefined,
    'a series page is not a video'
  )
  assert.equal(disney.listensFirst, true, 'Disney+ is heard from the start')
  assert.deepEqual(disney.controls, { playPause: false, seek: false }, 'Duet can’t work its player')
  assert.equal(disney.videoTitle('Disney+'), undefined, 'a bare site title is no title')

  const episode = 'https://www.crunchyroll.com/watch/GRDV0019R/romance-dawn'
  const crunchyroll = sourceFor(episode)
  assert.equal(crunchyroll?.site, 'crunchyroll', 'a Crunchyroll episode page is Crunchyroll')
  assert.equal(crunchyroll.videoId(episode), 'GRDV0019R', 'its episode id is in the path')
  assert.equal(
    crunchyroll.videoId('https://www.crunchyroll.com/de/watch/GRDV0019R/romance-dawn'),
    'GRDV0019R',
    'with a locale in front too'
  )
  assert.equal(
    crunchyroll.videoId('https://www.crunchyroll.com/series/GRMG8ZQZR/one-piece'),
    undefined,
    'a series page is not a video'
  )
  assert.equal(crunchyroll.listensFirst, true, 'Crunchyroll is heard from the start')
  assert.equal(
    crunchyroll.videoTitle('Watch One Piece - Romance Dawn - Crunchyroll'),
    'One Piece - Romance Dawn',
    'the title without the site’s words around it'
  )
  assert.equal(
    sourceFor('https://evil.com/?https://www.crunchyroll.com/watch/X'),
    undefined,
    'only the site’s own address counts'
  )

  const heardOnDisney = watcherOn(play, 'Disney+')
  assert.equal(heardOnDisney.watcher.needsHearing, true, 'on Disney+ Duet hears the video at once')

  // With no video open, the strip names every site Duet works on.
  const { quiet } = await jiti.import('../src/renderer/src/overlay/notice.ts')
  assert.equal(
    quiet({ trusted: true }, 'es').text,
    'Open a Spanish video on YouTube, Netflix, Disney+ or Crunchyroll',
    'the strip names every supported site'
  )

  console.log('Line source and translator retry tests passed.')
} finally {
  mock.timers.reset()
  rmSync(folder, { recursive: true, force: true })
}
