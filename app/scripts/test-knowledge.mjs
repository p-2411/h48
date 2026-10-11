// Checks the knowledge ladder: a word's key and its rung from the evidence (src/shared/knowledge.ts),
// and the main process's record of it (src/main/knowledge) on a temporary database, with a small fake
// "electron" module. Run: node scripts/test-knowledge.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-knowledge-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, is: { dev: false }, ipcMain: { handle: (channel, work) => handlers.set(channel, work) }, handlers }
`
)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron }, moduleCache: true })
const { wordKey, wordState, pairKeys } = await jiti.import(resolve('src/shared/knowledge.ts'))

const day = 86_400_000
const now = Date.UTC(2026, 9, 12, 12)
const none = { seen: 0, recalls: [], says: [], uses: [] }

// One key per word, whatever its form on screen or its case.
assert.equal(wordKey('es', ' Ir '), 'es:ir')
assert.equal(wordKey('ja', '行く'), 'ja:行く')
assert.notEqual(wordKey('es', 'ir'), wordKey('ja', 'ir'), 'a key belongs to its language')

// Not met, then met.
assert.equal(wordState(none), 'unknown')
assert.equal(wordState({ ...none, seen: 3 }), 'encountered')
assert.equal(wordState({ ...none, ignored: true, seen: 3 }), 'ignored', 'ignored wins')

// Known: recalled right on two different days (no card), or a card the learner remembers well.
const right = (daysAgo) => ({ at: now - daysAgo * day, good: true })
const wrong = (daysAgo) => ({ at: now - daysAgo * day, good: false })
assert.equal(wordState({ ...none, seen: 4, recalls: [right(3), right(3)] }), 'encountered', 'two right on one day is not yet known')
assert.equal(wordState({ ...none, seen: 4, recalls: [right(3), right(1)] }), 'known')
assert.equal(wordState({ ...none, seen: 4, recalls: [right(3), right(1), wrong(0)] }), 'encountered', 'missed it last time: back to encountered')
assert.equal(wordState({ ...none, seen: 1, card: { inReview: true, retrievability: 0.9 } }), 'known')
assert.equal(wordState({ ...none, seen: 1, card: { inReview: true, retrievability: 0.6 } }), 'encountered', 'a card being forgotten is not known')
assert.equal(wordState({ ...none, seen: 1, card: { inReview: false, retrievability: 0 } }), 'encountered', 'a card never reviewed is not known')
assert.equal(wordState({ ...none, seen: 1, card: { inReview: false, retrievability: 1 } }), 'encountered', 'a card still being learnt (just failed: FSRS says 1.0 all day) is not known')
assert.equal(wordState({ ...none, seen: 1, recalls: [right(3), right(1)], card: { inReview: false, retrievability: 1 } }), 'known', 'while it is learnt, recalls decide')
assert.equal(wordState({ ...none, seen: 1, recalls: [right(3), wrong(0)], card: { inReview: true, retrievability: 0.95 } }), 'encountered', 'missed in a recall last time: back down, card or not')
assert.equal(wordState({ ...none, seen: 1, recalls: [wrong(3), right(0)], card: { inReview: true, retrievability: 0.95 } }), 'known', 'a miss that was put right')

// Speakable: known, and said well on two different days (the last try good).
const known = { ...none, seen: 5, recalls: [right(5), right(2)] }
assert.equal(wordState({ ...known, says: [right(2), right(2)] }), 'known')
assert.equal(wordState({ ...known, says: [right(2), right(1)] }), 'speakable')
assert.equal(wordState({ ...known, says: [right(2), right(1), wrong(0)] }), 'known', 'said badly last time')
assert.equal(wordState({ ...none, seen: 5, says: [right(2), right(1)] }), 'encountered', 'saying it well is not knowing it')

// Usable: speakable, and used well in two different contexts (the last use good).
const speakable = { ...known, says: [right(2), right(1)] }
const use = (context, good = true) => ({ at: now - day, good, context })
assert.equal(wordState({ ...speakable, uses: [use('a'), use('a')] }), 'speakable', 'the same sentence twice is one context')
assert.equal(wordState({ ...speakable, uses: [use('a'), use('b')] }), 'usable')
assert.equal(wordState({ ...speakable, uses: [use('a'), use('b'), use('c', false)] }), 'speakable')

// Forgetting reaches the top: a usable word whose card is fading is encountered again.
assert.equal(wordState({ ...speakable, uses: [use('a'), use('b')], card: { inReview: true, retrievability: 0.5 } }), 'encountered')

// --- A line's words, by key -------------------------------------------------------------------------
const token = (text, job, pair, base) => ({ text, job, pair, space: true, ...(base && { base }) })
const line = { translation: 'Pedro went to the market.', source: [token('Pedro', 'x', 1, 'Pedro'), token('fue', 'v', 2, 'ir'), token('al', 'g', null), token('mercado', 'n', 3)], english: [] }
assert.deepEqual(pairKeys('es', line), [
  { pair: 1, key: 'es:pedro', text: 'Pedro', job: 'x' },
  { pair: 2, key: 'es:ir', text: 'fue', job: 'v' },
  { pair: 3, key: 'es:mercado', text: 'mercado', job: 'n' }
], 'each pair by its dictionary form (its words, when the line has none)')

// --- The record ---------------------------------------------------------------------------------------
try {
  const { Knowledge } = await jiti.import(resolve('src/main/knowledge/index.ts'))
  const { database } = await jiti.import(resolve('src/main/store/db.ts'))
  const knowledge = new Knowledge()
  const changed = []
  knowledge.on('changed', () => changed.push(true))
  const states = (keys) => knowledge.statesFor('es', keys)
  assert.deepEqual(states(['es:ir', 'es:nada']), { 'es:ir': 'unknown', 'es:nada': 'unknown' })
  knowledge.noteSeen('es', line, now)
  assert.deepEqual(states(['es:pedro', 'es:ir', 'es:mercado']), { 'es:pedro': 'ignored', 'es:ir': 'encountered', 'es:mercado': 'encountered' }, 'seen; names left out on their own')
  // Recalled right on two days: known. Said well on two days: speakable. Used in two sentences: usable.
  knowledge.noteAttempt('es', 'es:ir', 'recall', true, undefined, now - 3 * day)
  knowledge.noteAttempt('es', 'es:ir', 'recall', true, undefined, now - day)
  assert.equal(states(['es:ir'])['es:ir'], 'known')
  knowledge.noteAttempt('es', 'es:ir', 'say', true, undefined, now - 2 * day)
  knowledge.noteAttempt('es', 'es:ir', 'say', true, undefined, now - day)
  assert.equal(states(['es:ir'])['es:ir'], 'speakable')
  knowledge.noteAttempt('es', 'es:ir', 'use', true, 'Voy a ir al cine.', now - day)
  knowledge.noteAttempt('es', 'es:ir', 'use', true, 'Fuimos a la playa.', now)
  assert.equal(states(['es:ir'])['es:ir'], 'usable')
  assert.ok(changed.length >= 6, 'each attempt is told')
  // The learner's own choice beats the automatic one, both ways.
  knowledge.setIgnored('es', 'es:pedro', false)
  knowledge.setIgnored('es', 'es:mercado', true)
  assert.deepEqual(states(['es:pedro', 'es:mercado']), { 'es:pedro': 'encountered', 'es:mercado': 'ignored' })
  // A card counts through FSRS: a card reviewed and remembered well makes its word known.
  const fsrs = JSON.stringify({ due: new Date(now + 20 * day).toISOString(), stability: 30, difficulty: 5, elapsed_days: 0, scheduled_days: 20, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(now - day).toISOString() })
  database().prepare(`INSERT INTO cards (id, type, language, expression, meaning, target, source, dedupe_key, fsrs, fsrs_version, state, due, created_at, updated_at, word_key) VALUES ('c1', 'understand', 'es', 'gato', 'cat', 'gato', '{}', 'k', ?, 'ts-fsrs@5.4.2', 2, ?, ?, ?, 'es:gato')`).run(fsrs, now + 20 * day, now, now)
  assert.equal(knowledge.statesFor('es', ['es:gato'], now)['es:gato'], 'known', 'a strong card: known')
  // Talk's practice words: sayable, not yet usable (ir is usable by now; mercado is said well).
  knowledge.setIgnored('es', 'es:mercado', false)
  knowledge.noteAttempt('es', 'es:mercado', 'recall', true, undefined, now - 3 * day)
  knowledge.noteAttempt('es', 'es:mercado', 'recall', true, undefined, now - 2 * day)
  knowledge.noteAttempt('es', 'es:mercado', 'say', true, undefined, now - 2 * day)
  knowledge.noteAttempt('es', 'es:mercado', 'say', true, undefined, now - day)
  assert.deepEqual(knowledge.practiceWords('es', 8, now), [{ key: 'es:mercado', word: 'mercado', seenAs: 'mercado' }], 'only words sayable and not yet used')
  // The Words place: how many words on each rung, and the words, the last seen first.
  const summary = knowledge.summary('es', now)
  assert.equal(summary.counts.usable, 1, 'ir')
  assert.equal(summary.counts.speakable, 1, 'mercado')
  assert.equal(summary.counts.encountered, 1, 'pedro, brought back')
  assert.equal(summary.counts.unknown + summary.counts.known + summary.counts.ignored, 0)
  assert.deepEqual(summary.words.map((word) => [word.word, word.seenAs, word.state]).sort(), [['ir', 'fue', 'usable'], ['mercado', 'mercado', 'speakable'], ['pedro', 'Pedro', 'encountered']])
  assert.equal(knowledge.summary('ja', now).words.length, 0, 'by language')
  // The list keeps the newest of each rung, so an old rung isn't crowded out by a busy one.
  const seenLater = (word, at) => knowledge.noteSeen('ko', { translation: '', english: [], source: [{ text: word, job: 'n', pair: 0, space: false }] }, at)
  seenLater('오래된', now - 10 * day)
  knowledge.setIgnored('ko', 'ko:오래된', true)
  for (let index = 0; index < 510; index++) seenLater(`새${index}`, now - index)
  const crowded = knowledge.summary('ko', now)
  assert.equal(crowded.counts.encountered, 510)
  assert.equal(crowded.words.filter((word) => word.state === 'encountered').length, 500, 'up to 500 of a rung')
  assert.deepEqual(crowded.words.filter((word) => word.state === 'ignored').map((word) => word.word), ['오래된'], 'the old ignored word is still listed')
  // The rungs of lines met, as the daily session and checkpoints pick by them: every word of every
  // line, however many (a page asks about a few hundred at most; main asks in batches).
  const { ladderOf } = await jiti.import(resolve('src/main/challenges/ladder.ts'))
  const metLine = (id, processed) => ({ id, original: '', translation: '', processed })
  const many = Array.from({ length: 250 }, (_, index) => metLine(index, { translation: '', english: [], source: [{ text: `palabra${index}`, job: 'n', pair: 0, space: false }] }))
  knowledge.noteSeen('es', many[249].processed, now)
  const pedro = metLine(1000, line)
  const stateOf = ladderOf(knowledge, 'es', [pedro, ...many])
  assert.equal(stateOf(many[249], 0), 'encountered', 'a word past the first batch')
  assert.equal(stateOf(many[0], 0), 'unknown')
  assert.equal(stateOf(pedro, 2), 'usable', 'by the dictionary form')
  const broken = ladderOf({ statesFor: () => { throw new Error('locked') } }, 'es', many)
  assert.equal(broken, undefined, 'no ladder when it can’t be read: practice picks as before')
  // However many keys are asked about, each gets its rung (main asks in batches of what SQLite takes).
  const asked = Array.from({ length: 250 }, (_, index) => `es:palabra${index}`)
  assert.equal(Object.keys(knowledge.statesFor('es', asked, now)).length, 250, 'no key is dropped past 200')
  // Several attempts at once (a line said back, a sentence judged) are written together and told once.
  const before = changed.length
  knowledge.noteAttempts('es', [{ key: 'es:gato', kind: 'say', good: true }, { key: 'es:perro', kind: 'say', good: false }], now)
  assert.equal(changed.length, before + 1, 'one change for the batch')
  assert.equal(database().prepare("SELECT COUNT(*) n FROM word_evidence WHERE key IN ('es:gato', 'es:perro') AND kind = 'say'").get().n, 2)
  assert.throws(() => knowledge.noteAttempts('es', [{ key: 'es:gato', kind: 'say', good: true }, { key: 'ja:猫', kind: 'say', good: true }], now), /key/i)
  assert.equal(database().prepare("SELECT COUNT(*) n FROM word_evidence WHERE key = 'es:gato' AND kind = 'say'").get().n, 1, 'a bad key in a batch writes none of it')
  // Bad keys are refused, not stored.
  assert.throws(() => knowledge.noteAttempt('es', 'ja:行く', 'recall', true), /key/i, 'a key from another language')
  assert.throws(() => knowledge.noteAttempt('es', 'es:ir', 'shout', true), /kind/i)
  // The Words place reads the words newest first without sorting the table each time.
  const plan = database().prepare("EXPLAIN QUERY PLAN SELECT key, text FROM words WHERE language = 'es' ORDER BY last_seen DESC").all().map((row) => row.detail).join(' | ')
  assert.ok(plan.includes('words_recent') && !plan.includes('TEMP B-TREE'), `the words_recent index serves it: ${plan}`)
  // The IPC: only Duet's pages, keys of the language as Duet makes them, a bounded list, and a burst of
  // changes told once.
  const { connectKnowledge } = await jiti.import(resolve('src/main/knowledge/ipc.ts'))
  const electron = await jiti.import(fakeElectron)
  const page = {}
  const told = []
  connectKnowledge(knowledge, { owns: (sender) => sender === page, send: (channel) => told.push(channel) })
  const call = async (channel, sender, ...args) => electron.handlers.get(channel)({ sender }, ...args)
  await assert.rejects(call('knowledge:states', {}, 'es', ['es:ir']), /not allowed/i, 'another page is refused')
  assert.deepEqual(await call('knowledge:states', page, 'es', ['es:ir']), { 'es:ir': 'usable' })
  await assert.rejects(call('knowledge:states', page, 'es', Array.from({ length: 5001 }, (_, index) => `es:w${index}`)), /too many/i, 'a bounded list')
  await assert.rejects(call('knowledge:set-ignored', page, 'es', 'es: Ir', true), /word/i, 'a key as Duet makes it (trimmed, lower case)')
  await assert.rejects(call('knowledge:set-ignored', page, 'es', `es:${'a'.repeat(300)}`, true), /word/i, 'not too long')
  told.length = 0
  knowledge.noteAttempt('es', 'es:gato', 'recall', true, undefined, now)
  knowledge.noteAttempt('es', 'es:gato', 'recall', true, undefined, now)
  knowledge.emit('changed')
  assert.equal(told.length, 0, 'not told at once')
  await new Promise((done) => setImmediate(done))
  assert.deepEqual(told, ['knowledge:changed'], 'a burst of changes is told once')
  console.log('Knowledge ladder tests passed.')
} finally {
  // Windows cannot remove an open SQLite database. Release the test's handle first.
  const { database } = await jiti.import(resolve('src/main/store/db.ts'))
  database().close()
  rmSync(folder, { recursive: true, force: true })
}
