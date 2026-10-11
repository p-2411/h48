// Tests checkpoints (src/main/checkpoints): when one is offered (the trigger rules) and the
// checkpoint itself (its IPC, with fake models), on a temporary database with a small fake
// "electron" module. Run: node scripts/test-checkpoints.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-checkpoints-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, ipcMain: { handle: (channel, work) => { if (handlers.has(channel)) throw new Error('Attempted to register a second handler for ' + channel); handlers.set(channel, work) }, on: () => {} }, is: { dev: false }, handlers }
`
)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron }, moduleCache: true })
const root = resolve('src/main')

try {
  // --- When a checkpoint is offered -------------------------------------------------------------
  const { CheckpointTriggers, PAUSE_MS, OFFER_MS, OFFER_EVERY_MS, SLOWED_EVERY_MS } = await jiti.import(join(root, 'checkpoints/triggers.ts'))
  assert.equal(OFFER_MS, 10_000, 'an offer stands 10 s')
  assert.equal(OFFER_EVERY_MS, 5 * 60_000, 'two offers every 10 minutes')
  assert.equal(SLOWED_EVERY_MS, 10 * 60_000, 'one every 10 minutes after one is left alone')
  const triggers = new CheckpointTriggers()
  // What the app is doing at a moment: the video, playing or not, held by Duet, when a scene last ended.
  let t = 1_000_000
  const at = (change = {}) => triggers.tick({ now: t, video: 'youtube:a', playing: true, heldByDuet: false, canOffer: true, open: false, ...change })
  const pauseAt = (start) => {
    t = start
    at({ playing: false })
    t = start + PAUSE_MS
    return at({ playing: false })
  }

  assert.equal(at(), undefined, 'watching: no offer')
  const first = t
  assert.equal(at({ playing: false }), undefined, 'just paused: not yet')
  t = first + PAUSE_MS
  assert.equal(at({ playing: false }), 'pause', 'paused for 2 s: offered')
  t += 1000
  assert.equal(at(), 'pause', 'playing on does not end it: it stands its 10 s')
  t = first + PAUSE_MS + OFFER_MS - 1
  assert.equal(at(), 'pause')
  t += 1
  assert.equal(at(), undefined, 'untouched for 10 s: it fades (left alone)')

  assert.equal(pauseAt(first + PAUSE_MS + OFFER_EVERY_MS), undefined, 'left alone: not again after 5 minutes...')
  t += 1000
  at()
  assert.equal(pauseAt(first + PAUSE_MS + SLOWED_EVERY_MS), 'pause', '...but after 10 (slowed, never stopped)')
  t += OFFER_MS
  at()
  for (const round of [1, 2, 3]) {
    const start = t + SLOWED_EVERY_MS
    assert.equal(pauseAt(start), 'pause', `left alone ${round + 1} times: still offered every 10 minutes`)
    t += OFFER_MS
    at()
  }

  // Taking one brings back the normal pace: again after 5 minutes.
  const taken = t + SLOWED_EVERY_MS
  assert.equal(pauseAt(taken), 'pause')
  triggers.accept()
  assert.equal(at({ playing: false, open: true }), undefined, 'taken: the checkpoint is open')
  t += 60_000
  at({ open: false })
  assert.equal(pauseAt(taken + PAUSE_MS + OFFER_EVERY_MS), 'pause', 'after taking one: again 5 minutes on')

  // A new video starts at the normal pace.
  t += OFFER_MS
  at()
  const other = t + OFFER_EVERY_MS
  t = other
  triggers.tick({ now: t, video: 'youtube:b', playing: false, heldByDuet: false, canOffer: true, open: false })
  t = other + PAUSE_MS
  assert.equal(triggers.tick({ now: t, video: 'youtube:b', playing: false, heldByDuet: false, canOffer: true, open: false }), 'pause', 'a new video starts over')

  // A natural break: a scene or conversation just ended (judged from the dialogue). The glow stands
  // its 10 s, through the next scene's first lines, then fades; each scene end is offered once.
  const breaks = new CheckpointTriggers()
  let b = 5_000_000
  const tick = (change = {}) => breaks.tick({ now: b, video: 'youtube:c', playing: true, heldByDuet: false, canOffer: true, open: false, ...change })
  assert.equal(tick(), undefined, 'mid-scene: no offer')
  const sceneEnd = b
  assert.equal(tick({ sceneEndedAt: sceneEnd }), 'break', 'a scene ended: offered')
  b += OFFER_MS - 1
  assert.equal(tick({ sceneEndedAt: sceneEnd }), 'break', 'it stands its 10 s')
  b += 1
  assert.equal(tick({ sceneEndedAt: sceneEnd }), undefined, 'then fades')
  b += SLOWED_EVERY_MS
  assert.equal(tick({ sceneEndedAt: sceneEnd }), undefined, 'the same scene end is not offered twice')
  assert.equal(tick({ sceneEndedAt: b - 60_000 }), undefined, 'a scene end long gone is not offered')
  assert.equal(tick({ sceneEndedAt: b }), 'break', 'a new scene end is')

  // Duet's own pauses (Explain, Wait, talking to Duet), no lines to use, or a checkpoint already open:
  // no offer.
  const quiet = new CheckpointTriggers()
  let q = 9_000_000
  const still = (change = {}) => quiet.tick({ now: q, video: 'youtube:d', playing: false, heldByDuet: false, canOffer: true, open: false, ...change })
  still({ heldByDuet: true })
  q += PAUSE_MS * 3
  assert.equal(still({ heldByDuet: true }), undefined, 'paused by Duet: no offer')
  assert.equal(still({ canOffer: false }), undefined, 'nothing to ask about: no offer')
  assert.equal(still({ open: true }), undefined, 'a checkpoint open: no offer')

  // --- The checkpoint ------------------------------------------------------------------------------
  const electron = await jiti.import(fakeElectron)
  const { WatchLog } = await jiti.import(join(root, 'watchlog/index.ts'))
  const { Checkpoints } = await jiti.import(join(root, 'checkpoints/index.ts'))
  const { EventEmitter } = await import('node:events')
  const word = (text, job, pair, space = true) => ({ text, job, pair, space })
  const movie = {
    translation: 'I watched a movie with a friend yesterday.',
    source: [word('저는', 'p', 0), word('어제', 'a', 1), word('친구', 'n', 2, false), word('랑', 'g', 3), word('영화', 'n', 4, false), word('를', 'g', null), word('봤어요', 'v', 5, false), word('.', 'g', null, false)],
    english: [word('I', 'p', 0), word('watched', 'v', 5), word('a movie', 'n', 4), word('with', 'g', 3), word('a friend', 'n', 2), word('yesterday', 'a', 1, false), word('.', 'g', null, false)]
  }
  const market = {
    translation: 'If I go this way, will I reach the market?',
    source: [word('이', 'p', 0), word('길', 'n', 1, false), word('로', 'g', 2), word('가면', 'v', 3), word('시장', 'n', 4, false), word('이', 'g', null), word('나와요', 'v', 5, false), word('?', 'g', null, false)],
    english: []
  }
  const log = new WatchLog()
  const now = Date.now()
  const video = { site: 'youtube', id: 'cp', url: 'https://www.youtube.com/watch?v=cp', title: 'Sintel' }
  log.noteVideo(video, 'ko', 60, now - 60_000)
  log.noteLine('youtube:cp', 'ko', { id: 1, original: '저는 어제 친구랑 영화를 봤어요.', at: 0, start: 50, state: 'ready', processed: movie }, now - 50_000)
  log.noteLine('youtube:cp', 'ko', { id: 2, original: '이 길로 가면 시장이 나와요?', at: 0, start: 55, state: 'ready', processed: market }, now - 40_000)
  log.noteWord({ kind: 'saved', videoKey: 'youtube:cp', language: 'ko', text: '친구' }, now - 30_000)

  const overlayPage = {}
  const sent = []
  const holds = []
  const missed = []
  const watcher = Object.assign(new EventEmitter(), { currentVideo: video })
  const player = { playing: false, isHeldBy: () => false, hold: (holder) => holds.push(['hold', holder]), release: (holder) => holds.push(['release', holder]) }
  const settings = Object.assign(new EventEmitter(), { current: { language: 'ko', checkpoints: true }, update: (change) => Object.assign(settings.current, change) })
  const checkpoints = new Checkpoints({
    watcher,
    player,
    settings,
    log,
    cards: { missed: (draft) => missed.push(draft) },
    voice: { tts: { speak: async (text) => ({ data: new Uint8Array([7]), mimeType: 'audio/mpeg', text }) }, coach: { coach: async () => ({ heard: '', note: 'Close.' }) } },
    quiz: { ask: async () => 'Q?', mark: async () => ({ note: 'Yes.' }) },
    overlay: { owns: (sender) => sender === overlayPage, send: (channel, value) => sent.push([channel, value]) },
    random: () => 0
  })
  const call = async (channel, sender, ...args) => electron.handlers.get(channel)({ sender }, ...args)

  // A pause the learner makes, held 2 s: the strip is told to glow.
  watcher.emit('current', 2)
  checkpoints.tick(now)
  checkpoints.tick(now + 2_100)
  assert.deepEqual(sent.at(-1), ['checkpoint:offer', 'pause'], 'the strip is told to glow')
  await assert.rejects(call('checkpoint:open', {}), /not allowed/i, 'only the strip opens a checkpoint')
  const opened = await call('checkpoint:open', overlayPage)
  assert.equal(opened.kind, 'recall', 'with a word looked at in the last few minutes: recall it')
  assert.equal(opened.answer, undefined, 'the strip is not told the answer')
  assert.deepEqual(holds.at(-1), ['hold', 'checkpoint'], 'the video waits while a checkpoint is open')
  assert.deepEqual(sent.at(-1), ['checkpoint:offer', null], 'the glow goes once it is open')
  const wrong = await call('checkpoint:check-recall', overlayPage, opened.choices.find((choice) => choice !== '친구'))
  assert.equal(wrong.correct, false)
  assert.equal(missed.length, 1, 'a word missed in a checkpoint becomes a card')
  const before = log.streak(now).keptToday
  assert.equal(before, false)
  await call('checkpoint:done', overlayPage)
  assert.equal(log.streak().keptToday, true, 'finishing a checkpoint keeps the day')
  assert.deepEqual(holds.at(-1), ['release', 'checkpoint'], 'and lets the video go')

  // Off in Settings: no offers.
  settings.current.checkpoints = false
  const quietSince = sent.length
  checkpoints.tick(now + SLOWED_EVERY_MS + 10_000)
  checkpoints.tick(now + SLOWED_EVERY_MS + 13_000)
  assert.equal(sent.slice(quietSince).filter(([, value]) => value).length, 0, 'checkpoints off: no glow')

  // Checkpoints turn themselves on after the third video watched, unless the learner chose.
  electron.handlers.clear()
  const fresh = Object.assign(new EventEmitter(), { current: { language: 'ko' }, update: (change) => Object.assign(fresh.current, change) })
  const counting = { videoCount: () => 2, videoLines: () => undefined, hasLinesSince: () => false, noteWord: () => {}, markCheckpointDone: () => {}, streak: () => ({}) }
  const auto = new Checkpoints({ watcher, player, settings: fresh, log: counting, cards: { missed: () => {} }, overlay: { owns: () => false, send: () => {} } })
  auto.tick(now)
  assert.equal(fresh.current.checkpoints, undefined, 'two videos: not yet')
  counting.videoCount = () => 3
  auto.tick(now + 61_000)
  assert.equal(fresh.current.checkpoints, true, 'the third video: on')
  fresh.current.checkpoints = false
  auto.tick(now + 200_000)
  assert.equal(fresh.current.checkpoints, false, 'turned off by the learner: stays off')

  // --- Breaks come where a scene or conversation ends ---------------------------------------------
  // A transcript is split into scenes once; passing the last line of a scene is a break.
  const asked = []
  const scenes = {
    sceneEnds: async (lines) => (asked.push(['ends', lines.length]), [1]),
    endsHere: async (lines) => (asked.push(['here', lines.length]), true)
  }
  const ready = (id, original) => ({ id, original, at: 0, start: id, state: 'ready', processed: movie })
  const transcriptWatcher = Object.assign(new EventEmitter(), { currentVideo: video, script: { source: 'transcript', lines: [] } })
  const playing = { ...player, playing: true }
  const on = Object.assign(new EventEmitter(), { current: { language: 'ko', checkpoints: true }, update: () => {} })
  const sent2 = []
  electron.handlers.clear()
  const scened = new Checkpoints({ watcher: transcriptWatcher, player: playing, settings: on, log, cards: { missed: () => {} }, scenes, overlay: { owns: () => true, send: (channel, value) => sent2.push([channel, value]) } })
  transcriptWatcher.script = { source: 'transcript', lines: [ready(10, 'a'), ready(11, 'b'), ready(12, 'c')] }
  transcriptWatcher.emit('script', transcriptWatcher.script)
  transcriptWatcher.emit('script', transcriptWatcher.script)
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(asked, [['ends', 3]], 'the transcript is split into scenes once')
  const t0 = Date.now()
  transcriptWatcher.emit('current', 10)
  transcriptWatcher.emit('current', 11)
  scened.tick(t0 + 100)
  assert.equal(sent2.filter(([, value]) => value).length, 0, 'mid-scene: no glow')
  transcriptWatcher.emit('current', null)
  scened.tick(Date.now() + 100)
  assert.deepEqual(sent2.at(-1), ['checkpoint:offer', 'break'], 'past the last line of a scene: the strip glows')

  // With no transcript (captions, Netflix), a pause in the dialogue after a few lines is judged.
  const captionWatcher = Object.assign(new EventEmitter(), { currentVideo: video, script: { source: 'captions', lines: [] } })
  const sent3 = []
  asked.length = 0
  electron.handlers.clear()
  const judged = new Checkpoints({ watcher: captionWatcher, player: playing, settings: on, log, cards: { missed: () => {} }, scenes, overlay: { owns: () => true, send: (channel, value) => sent3.push([channel, value]) } })
  for (const id of [20, 21, 22]) {
    captionWatcher.emit('line', ready(id, `line ${id}`))
    captionWatcher.emit('current', id)
  }
  const said = Date.now()
  judged.tick(said + 1000)
  assert.deepEqual(asked, [], 'while lines keep coming: not judged')
  judged.tick(said + 6000)
  assert.deepEqual(asked, [['here', 3]], 'a pause in the dialogue after a few lines: judged once')
  judged.tick(said + 6100)
  assert.equal(asked.length, 1, 'not judged again while the answer is coming')
  await new Promise((done) => setTimeout(done, 0))
  judged.tick(Date.now() + 100)
  assert.deepEqual(sent3.at(-1), ['checkpoint:offer', 'break'], 'judged the end of the exchange: the strip glows')

  // --- What the audit found ---------------------------------------------------------------------------
  // Checkpoints off: no transcript is sent to the scene model; turning them on splits it then.
  asked.length = 0
  electron.handlers.clear()
  const offSettings = Object.assign(new EventEmitter(), { current: { language: 'ko', checkpoints: false }, update: () => {} })
  const offWatcher = Object.assign(new EventEmitter(), { currentVideo: video, script: { source: 'transcript', lines: [ready(30, 'x'), ready(31, 'y')] } })
  new Checkpoints({ watcher: offWatcher, player: playing, settings: offSettings, log, cards: { missed: () => {} }, scenes, overlay: { owns: () => true, send: () => {} } })
  offWatcher.emit('script', offWatcher.script)
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(asked, [], 'checkpoints off: the transcript is not sent anywhere')
  offSettings.current.checkpoints = true
  offSettings.emit('change', offSettings.current, { checkpoints: true })
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(asked, [['ends', 2]], 'turned on: the video on screen is split then')

  // A checkpoint open when the video changes is closed: the video goes, the strip is told, and offers
  // come again (it doesn't stay open for good).
  electron.handlers.clear()
  const changing = Object.assign(new EventEmitter(), { currentVideo: video })
  const changingHolds = []
  const changingSent = []
  const changingPlayer = { playing: false, isHeldBy: () => false, hold: (holder) => changingHolds.push(['hold', holder]), release: (holder) => changingHolds.push(['release', holder]) }
  const moving = new Checkpoints({ watcher: changing, player: changingPlayer, settings: on, log, cards: { missed: () => {} }, overlay: { owns: () => true, send: (channel, value) => changingSent.push([channel, value]) }, random: () => 0 })
  const t1 = Date.now()
  changing.emit('current', 1)
  moving.tick(t1)
  moving.tick(t1 + 2_100)
  await call('checkpoint:open', overlayPage)
  changing.currentVideo = { site: 'youtube', id: 'other', url: 'https://www.youtube.com/watch?v=other' }
  moving.tick(t1 + 3_000)
  assert.deepEqual(changingHolds.at(-1), ['release', 'checkpoint'], 'another video: the open checkpoint lets the video go')
  assert.ok(changingSent.some(([channel]) => channel === 'checkpoint:closed'), '...and the strip drops its card')
  // The strip's page reloaded (or crashed): its open checkpoint is closed too.
  changing.currentVideo = video
  log.noteLine('youtube:cp', 'ko', { id: 3, original: '저는 어제 친구랑 영화를 봤어요.', at: 0, start: 60, state: 'ready', processed: movie }, t1 + 3_100 + SLOWED_EVERY_MS)
  moving.tick(t1 + 3_100)
  moving.tick(t1 + 3_100 + SLOWED_EVERY_MS)
  moving.tick(t1 + 3_100 + SLOWED_EVERY_MS + 2_100)
  await call('checkpoint:open', overlayPage)
  moving.reset()
  assert.deepEqual(changingHolds.at(-1), ['release', 'checkpoint'], 'reset closes an open checkpoint')

  // Duet's own hold (an open checkpoint, Explain, Wait, voice) is not the learner's pause.
  electron.handlers.clear()
  const heldSent = []
  const held = new Checkpoints({ watcher: changing, player: { ...changingPlayer, isHeldBy: (holder) => holder === 'explain' }, settings: on, log, cards: { missed: () => {} }, overlay: { owns: () => true, send: (channel, value) => heldSent.push([channel, value]) } })
  held.tick(t1)
  held.tick(t1 + 5_000)
  assert.equal(heldSent.filter(([, value]) => value).length, 0, 'paused by Explain: no glow')

  // Without a transcript, a pause in the dialogue is judged only when an offer could follow: not while
  // a recent offer's wait is running.
  electron.handlers.clear()
  asked.length = 0
  const coolWatcher = Object.assign(new EventEmitter(), { currentVideo: video, script: { source: 'captions', lines: [] } })
  const cool = new Checkpoints({ watcher: coolWatcher, player: { ...changingPlayer, playing: false }, settings: on, log, cards: { missed: () => {} }, scenes, overlay: { owns: () => true, send: () => {} } })
  const t2 = Date.now()
  coolWatcher.emit('current', 40)
  cool.tick(t2)
  cool.tick(t2 + 2_100) // a pause offer: the wait starts
  cool.tick(t2 + 13_000) // it faded, left alone
  for (const id of [41, 42, 43]) {
    coolWatcher.emit('line', ready(id, `line ${id}`))
    coolWatcher.emit('current', id)
  }
  cool.tick(Date.now() + 6_000)
  assert.deepEqual(asked, [], 'within the wait after an offer: the dialogue is not judged')

  // The content check is a cheap query, served by an index.
  assert.equal(log.hasLinesSince('youtube:cp', Date.now() - 5 * 60_000), true)
  assert.equal(log.hasLinesSince('youtube:cp', Date.now() + 2 * SLOWED_EVERY_MS), false)
  assert.equal(log.hasLinesSince('youtube:nothing', 0), false)
  const { database } = await jiti.import(join(root, 'store/db.ts'))
  const plan = database().prepare("EXPLAIN QUERY PLAN SELECT 1 FROM lines WHERE video_id = ? AND language = ? AND met_at >= ? LIMIT 1").all('youtube:cp', 'ko', 0)
  assert.ok(plan.some((row) => String(row.detail).includes('lines_recent')), `the recent-lines check uses its index: ${JSON.stringify(plan)}`)

  console.log('Checkpoint tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
