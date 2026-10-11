// Tests the daily session (src/main/daily): what goes in it, the recall challenge, and its IPC
// (the page names lines by id; main keeps the plan and the answers), with fake voice and quiz
// models, a fake "electron" module and a temporary database. Run: node scripts/test-daily.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-session-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
module.exports = {
  app: { getPath: () => ${JSON.stringify(folder)} },
  ipcMain: { handle: (channel, work) => handlers.set(channel, work), on: () => {} },
  is: { dev: false },
  handlers
}
`
)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron }, moduleCache: true })
const root = resolve('src/main')
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

// Lines as the watch log keeps them: words with jobs and pairs (see shared/types ProcessedLine).
const word = (text, job, pair, space = true) => ({ text, job, pair, space })
const processed = (translation, ...source) => ({ translation, source, english: [] })
// "I watched a movie with a friend yesterday." (with its English pairs, as real lines have)
const movie = processed(
  'I watched a movie with a friend yesterday.',
  word('저는', 'p', 0),
  word('어제', 'a', 1),
  word('친구', 'n', 2, false),
  word('랑', 'g', 3),
  word('영화', 'n', 4, false),
  word('를', 'g', null),
  word('봤어요', 'v', 5, false),
  word('.', 'g', null, false)
)
movie.english = [
  word('I', 'p', 0),
  word('watched', 'v', 5),
  word('a movie', 'n', 4),
  word('with', 'g', 3),
  word('a friend', 'n', 2),
  word('yesterday', 'a', 1, false),
  word('.', 'g', null, false)
]
// "If I go this way, will I reach the market?"
const market = processed(
  'If I go this way, will I reach the market?',
  word('이', 'p', 0),
  word('길', 'n', 1, false),
  word('로', 'g', 2),
  word('가면', 'v', 3),
  word('시장', 'n', 4, false),
  word('이', 'g', null),
  word('나와요', 'v', 5, false),
  word('?', 'g', null, false)
)
// "Hello, the weather is really nice today."
const weather = processed(
  'Hello, the weather is really nice today.',
  word('안녕하세요', 'x', 0, false),
  word(',', 'g', null),
  word('오늘', 'a', 1),
  word('날씨', 'n', 2, false),
  word('가', 'g', null),
  word('정말', 'a', 3),
  word('좋네요', 'a', 4, false),
  word('.', 'g', null, false)
)
// Always the first option: a "random" that makes picks and shuffles predictable.
const first = () => 0

try {
  // --- Recall a word ------------------------------------------------------------------------------
  const { recallChallenge } = await jiti.import(join(root, 'daily/recall.ts'))
  const recall = recallChallenge(movie, 2, [market, weather], first)
  assert.equal(recall.answer, '친구')
  assert.equal(recall.before, '저는 어제')
  assert.equal(recall.after, '랑 영화를 봤어요.')
  assert.deepEqual([recall.spaceBefore, recall.spaceAfter], [true, false], 'written "저는 어제 ___랑 영화를 봤어요."')
  assert.equal(recall.choices.length, 3)
  assert.ok(recall.choices.includes('친구'), 'the answer is one of the choices')
  assert.equal(new Set(recall.choices).size, 3, 'three different choices')
  for (const choice of recall.choices.filter((text) => text !== '친구'))
    assert.ok(['영화', '길', '시장', '날씨'].includes(choice), `${choice}: the other choices do the same job (things)`)
  assert.equal(recallChallenge(movie, 2, [], first).choices.length, 3, 'other words of the same line can be the other choices')
  assert.equal(recallChallenge(processed('Hi', word('네', 'x', 0, false)), 0, [], first), undefined, 'no recall without two other words to choose from')
  const split = processed('x', word('a', 'n', 0), word('b', 'v', 1), word('c', 'n', 0, false))
  assert.equal(recallChallenge(split, 0, [movie], first), undefined, 'a pair split across the line is not blanked')

  // --- What goes in the session -------------------------------------------------------------------
  const { planSession, SESSION_CARDS } = await jiti.import(join(root, 'daily/plan.ts'))
  const met = (id, line) => ({ id, original: line.source.map((t) => t.text + (t.space ? ' ' : '')).join('').trim(), translation: line.translation, processed: line })
  const lines = [met(3, weather), met(2, market), met(1, movie)] // newest first
  assert.deepEqual(planSession({ due: 4, lines: [], words: [], random: first }), { cards: 4 }, 'nothing watched lately: due cards only')
  assert.equal(planSession({ due: 40, lines: [], words: [], random: first }).cards, SESSION_CARDS, 'cards are capped so the session stays about 5 minutes')

  const withWords = planSession({ due: 2, lines, words: ['시장', '친구'], random: first })
  assert.equal(withWords.say.id, 2, 'the line to say back has a word the learner looked at, newest first')
  assert.equal(withWords.challenge.kind, 'recall', 'with words looked at, recall one')
  assert.equal(withWords.challenge.line.id, 1, '...from another line than the one said back')
  assert.equal(withWords.challenge.recall.answer, '친구')

  const noWords = planSession({ due: 0, lines, words: [], random: first })
  assert.equal(noWords.say.id, 3, 'with no words looked at, the newest line')
  assert.equal(noWords.challenge.kind, 'meaning', 'with no words looked at, what did they mean')
  assert.notEqual(noWords.challenge.line.id, noWords.say.id)

  const long = processed('long', ...Array.from({ length: 30 }, (_, index) => word(`w${index}`, 'n', index)))
  assert.equal(planSession({ due: 0, lines: [met(9, long), met(1, movie)], words: [], random: first }).say.id, 1, 'a line too long to say back is skipped')
  const one = planSession({ due: 0, lines: [met(1, movie)], words: [], random: first })
  assert.equal(one.challenge.line.id, 1, 'with one line, the challenge may use it too')

  // --- The session's IPC --------------------------------------------------------------------------
  const electron = await jiti.import(fakeElectron)
  const { WatchLog } = await jiti.import(join(root, 'watchlog/index.ts'))
  const { database } = await jiti.import(join(root, 'store/db.ts'))
  const { DailySession } = await jiti.import(join(root, 'daily/index.ts'))
  const log = new WatchLog()
  const video = { site: 'youtube', id: 'sess', url: 'https://www.youtube.com/watch?v=sess', title: 'Sintel' }
  log.noteVideo(video, 'ko', 10, at(2026, 11, 10, 20, 0))
  let lineId = 0
  for (const line of [movie, market, weather])
    log.noteLine('youtube:sess', 'ko', { id: ++lineId, original: met(0, line).original, at: 0, start: lineId * 10, state: 'ready', processed: line }, at(2026, 11, 10, 20, lineId))
  log.noteWord({ kind: 'hovered', videoKey: 'youtube:sess', language: 'ko', text: '시장' }, at(2026, 11, 10, 20, 5))
  log.noteWord({ kind: 'saved', videoKey: 'youtube:sess', language: 'ko', text: '친구' }, at(2026, 11, 10, 20, 6))

  const spoken = []
  const coached = []
  const voice = {
    tts: { speak: async (text, language) => (spoken.push([text, language]), { data: new Uint8Array([1, 2]), mimeType: 'audio/mpeg' }) },
    coach: { coach: async (clip, line) => (coached.push([clip.mimeType, line.original]), { heard: line.original, note: 'Nice and clear.' }) }
  }
  const quiz = {
    ask: async (line) => `What is the speaker asking about in "${line.original}"?`,
    mark: async (line, question, answer) => ({ note: answer.includes('market') ? 'Yes, that’s it.' : 'Not quite: they ask the way to the market.' })
  }
  let home = {}
  const reminders = []
  const missed = []
  new DailySession({ setReminder: (time) => reminders.push(time), log, cards: { counts: () => ({ due: 3, newAvailable: 1 }), missed: (draft) => (missed.push(draft), { made: true }) }, voice, quiz, owns: (sender) => sender === home, random: first })
  const fromHome = { sender: home }
  const fromElsewhere = { sender: {} }
  // Like Electron's ipcMain.handle, a handler that throws gives the page a rejected promise.
  const call = async (channel, event, ...args) => electron.handlers.get(channel)(event, ...args)

  await assert.rejects(call('daily:plan', fromElsewhere), /not allowed/i, 'only the home page runs the session')
  const plan = await call('daily:plan', fromHome)
  assert.equal(plan.cards, 4)
  assert.equal(plan.video, 'Sintel', 'the session names the video its lines come from')
  assert.equal(plan.say.original, '이 길로 가면 시장이 나와요?')
  assert.equal(plan.challenge.kind, 'recall')
  assert.equal(plan.challenge.answer, undefined, 'the page is not told the answer')
  assert.equal(plan.challenge.choices.length, 3)

  const audio = await call('daily:speak', fromHome)
  assert.deepEqual(spoken, [['이 길로 가면 시장이 나와요?', 'ko']], 'Duet speaks the planned line, in the language')
  assert.equal(audio.mimeType, 'audio/mpeg')
  const attempt = await call('daily:coach', fromHome, { data: new Uint8Array([9]), mimeType: 'audio/wav' })
  assert.deepEqual(attempt, { heard: '이 길로 가면 시장이 나와요?', note: 'Nice and clear.' })
  assert.deepEqual(coached, [['audio/wav', '이 길로 가면 시장이 나와요?']], 'the attempt is judged against the planned line')
  await assert.rejects(call('daily:coach', fromHome, { data: 'not audio', mimeType: 'audio/wav' }), /recording/i, 'a recording must be audio')

  assert.deepEqual(await call('daily:check-recall', fromHome, '친구'), { correct: true, answer: '친구' })
  assert.equal(missed.length, 0, 'a word recalled is not a miss')
  const wrong = await call('daily:check-recall', fromHome, plan.challenge.choices.find((choice) => choice !== '친구'))
  assert.deepEqual(wrong, { correct: false, answer: '친구' })
  // A word missed becomes a card (or its card comes due now), from the line it was in, and the watch
  // log records the miss.
  assert.equal(missed.length, 1)
  assert.equal(missed[0].expression, '친구')
  assert.equal(missed[0].source.moment.line.original, '저는 어제 친구랑 영화를 봤어요.')
  assert.deepEqual([missed[0].source.moment.video.site, missed[0].source.moment.video.id], ['youtube', 'sess'])
  assert.equal(database().prepare("SELECT COUNT(*) n FROM word_events WHERE kind = 'missed' AND text = '친구' AND video_id = 'youtube:sess'").get().n, 1)
  await call('daily:check-recall', fromHome, plan.challenge.choices.find((choice) => choice !== '친구'))
  assert.equal(missed.length, 1, 'one miss per challenge, however many wrong picks')

  // The reminder's time, from Settings: a time, or none (off); anything else is refused.
  await call('daily:set-reminder', fromHome, '19:30')
  await call('daily:set-reminder', fromHome, null)
  await assert.rejects(call('daily:set-reminder', fromHome, '7pm'), /time/i)
  await assert.rejects(call('daily:set-reminder', fromElsewhere, '19:30'), /not allowed/i)
  assert.deepEqual(reminders, ['19:30', undefined])

  const done = await call('daily:done', fromHome)
  assert.equal(done.keptToday, true, 'finishing the session keeps the day')

  // With no words looked at, the challenge is "what did they mean?", asked and marked by the quiz model.
  new DailySession({ setReminder: () => {}, log: { lastVideo: () => ({ key: 'youtube:plain', title: 'Plain', language: 'ko', lines: [met(1, movie), met(2, market)], words: [] }), markSessionDone: () => {}, streak: () => ({}) }, cards: { counts: () => ({ due: 0, newAvailable: 0 }), missed: () => ({ made: true }) }, voice, quiz, owns: () => true, random: first })
  const planned = await call('daily:plan', fromHome)
  assert.equal(planned.challenge.kind, 'meaning')
  const question = await call('daily:meaning-question', fromHome)
  assert.match(question.question, /What is the speaker asking/)
  assert.deepEqual(await call('daily:meaning-check', fromHome, 'the way to the market'), { note: 'Yes, that’s it.' })
  await assert.rejects(call('daily:meaning-check', fromHome, 42), /answer/i, 'an answer must be text')

  // --- The daily reminder ------------------------------------------------------------------------
  const { nextReminderAt, parseReminder, Reminder } = await jiti.import(join(root, 'daily/reminder.ts'))
  assert.equal(nextReminderAt('19:30', at(2026, 11, 10, 18, 0)), at(2026, 11, 10, 19, 30), 'later today')
  assert.equal(nextReminderAt('19:30', at(2026, 11, 10, 19, 30)), at(2026, 11, 11, 19, 30), 'at the time itself: tomorrow')
  assert.equal(nextReminderAt('07:05', at(2026, 11, 10, 22, 0)), at(2026, 11, 11, 7, 5), 'past today: tomorrow')
  assert.equal(parseReminder('19:30'), '19:30')
  for (const bad of ['7:30', '24:00', '19:60', 'soon', 1930, null, undefined]) assert.equal(parseReminder(bad), undefined, `${bad} is not a time`)

  const notified = []
  let kept = false
  const reminder = new Reminder({ streak: () => ({ days: 2, keptToday: kept, freezesLeft: 2 }), notify: (text) => notified.push(text) })
  reminder.remind()
  assert.equal(notified.length, 1, 'a reminder when today is not kept yet')
  kept = true
  reminder.remind()
  assert.equal(notified.length, 1, 'no reminder once today is kept')

  // --- The recording, as WAV ------------------------------------------------------------------------
  const { encodeWav, downsample } = await jiti.import(resolve('src/renderer/src/components/challenges/wav.ts'))
  const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16_000)
  const text = (from, to) => String.fromCharCode(...wav.slice(from, to))
  assert.equal(text(0, 4), 'RIFF')
  assert.equal(text(8, 12), 'WAVE')
  assert.equal(wav.length, 44 + 4 * 2, 'a 44-byte header, then 16-bit samples')
  const dataView = new DataView(wav.buffer)
  assert.equal(dataView.getUint32(24, true), 16_000, 'the sample rate')
  assert.equal(dataView.getUint16(22, true), 1, 'one channel')
  assert.deepEqual([1, 2, 3, 4].map((index) => dataView.getInt16(42 + index * 2, true)), [0, 32767, -32768, 16384])
  const clipped = new DataView(encodeWav(new Float32Array([2, -3]), 16_000).buffer)
  assert.deepEqual([clipped.getInt16(44, true), clipped.getInt16(46, true)], [32767, -32768], 'loud samples are clipped, not wrapped')
  assert.equal(downsample(new Float32Array(48_000), 48_000, 16_000).length, 16_000, 'a second at 48 kHz is a second at 16 kHz')
  assert.deepEqual([...downsample(new Float32Array([0.3, 0.3, 0.3, 0.9, 0.9, 0.9]), 48_000, 16_000)].map((value) => Math.round(value * 10)), [3, 9], 'each new sample averages the ones it stands for')

  console.log('Daily session tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
