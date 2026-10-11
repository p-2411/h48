// Checks the line task's output shape and alignment (src/main/ai/lines) and how words are written
// on the strip (src/shared/levels.ts): readings in Latin letters for languages not written in them.
// Run: npx jiti scripts/test-lines.mjs
import assert from 'node:assert/strict'
import { alignLine } from '../src/main/ai/lines/align.ts'
import { linesOutputSchema, systemPrompt } from '../src/main/ai/lines/prompt.ts'
import { AUTO, isLevel, mixedLine, pairReading, written } from '../src/shared/levels.ts'

// Japanese and Korean phrases come with their reading; Spanish ones don't need one.
const phrase = { source: '映画', english: 'a movie', job: 'n', reading: 'eiga', base: '映画' }
const reply = (phrases) => ({ lines: [{ translation: 'I watched a movie.', phrases }] })
assert.equal(linesOutputSchema('ja').safeParse(reply([phrase])).success, true)
assert.equal(linesOutputSchema('ja').safeParse(reply([{ ...phrase, reading: undefined }])).success, false, 'Japanese needs readings')
assert.equal(linesOutputSchema('ko').safeParse(reply([phrase])).success, true)
assert.equal(linesOutputSchema('es').safeParse(reply([{ source: 'fue', english: 'went', job: 'v', base: 'ir' }])).success, true)
assert.equal(linesOutputSchema('es').safeParse(reply([{ source: 'fue', english: 'went', job: 'v' }])).success, false, 'every phrase has its dictionary form')
assert.match(systemPrompt('es'), /base:/, 'the prompt asks for the dictionary form')
assert.match(systemPrompt('ja'), /reading/, 'the Japanese prompt asks for readings')
assert.doesNotMatch(systemPrompt('es'), /reading:/, 'the Spanish prompt does not')

// The reading stays with the phrase's word on the line.
const line = alignLine('映画を見た。', 'I watched a movie.', [
  { source: '映画', english: 'a movie', job: 'n', reading: 'eiga', base: '映画' },
  { source: '見た', english: 'watched', job: 'v', reading: 'mita', base: '見る' }
])
assert.equal(line.source.find((token) => token.text === '見た').base, '見る', 'a word keeps its dictionary form (the key it is learnt under)')
const movie = line.source.find((token) => token.text === '映画')
assert.equal(movie.reading, 'eiga')
assert.equal(line.english.find((token) => token.text === 'a movie').reading, undefined, 'English words have none')
assert.equal(pairReading(line.source, movie.pair), 'eiga')
assert.equal(pairReading(alignLine('Vi una película.', 'I saw a movie.', [{ source: 'película', english: 'movie', job: 'n', base: 'película' }]).source, 1), undefined)

// On the strip, a word is written in its own script, or in its reading when that is chosen.
assert.equal(written(movie, 'native'), '映画')
assert.equal(written(movie, 'reading'), 'eiga')
assert.equal(written({ text: 'película', job: 'n', pair: 1, space: true }, 'reading'), 'película', 'no reading: as written')

// The words swapped into the English line keep their reading, so the strip can write them in it.
const mixed = mixedLine(line, 1)
const swapped = mixed.find((token) => token.swapped)
assert.equal(swapped?.text, '映画')
assert.equal(swapped?.base, '映画', 'and its dictionary form, for its colour on the strip')
assert.equal(written(swapped, 'reading'), 'eiga', 'a swapped word is written in its reading when chosen')

// Auto: the words of level 1 (things), and every word the learner knows, whatever its job.
const pairOf = (text) => line.source.find((token) => token.text === text).pair
const swappedIn = (tokens) => tokens.filter((token) => token.swapped).map((token) => token.text)
assert.deepEqual(swappedIn(mixedLine(line, AUTO, () => 'encountered')), ['映画'], 'auto, nothing known yet: like level 1')
assert.deepEqual(swappedIn(mixedLine(line, AUTO, (pair) => (pair === pairOf('見た') ? 'known' : 'encountered'))).sort(), ['映画', '見た'].sort(), 'auto: a known verb comes in too')
assert.deepEqual(swappedIn(mixedLine(line, AUTO, (pair) => (pair === pairOf('見た') ? 'speakable' : 'ignored'))), ['見た'], 'an ignored word stays in English, even a thing')
assert.deepEqual(swappedIn(mixedLine(line, AUTO)), ['映画'], 'auto without the ladder: level 1')
assert.deepEqual(swappedIn(mixedLine(line, 2, () => 'ignored')).sort(), ['映画', '見た'].sort(), 'a chosen level is the level, whatever the ladder')

// Only real levels are kept (the strip sends one; anything else is ignored).
assert.ok([0, 1, 2, 3, 4, 5].every(isLevel))
assert.ok(![6, -1, 1.5, '2', null, undefined].some(isLevel))

console.log('Line task and reading tests passed.')
