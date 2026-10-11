// Checks the line task's output shape and alignment (src/main/ai/lines) and how words are written
// on the strip (src/shared/levels.ts): readings in Latin letters for languages not written in them.
// Run: npx jiti scripts/test-lines.mjs
import assert from 'node:assert/strict'
import { alignLine } from '../src/main/ai/lines/align.ts'
import { linesOutputSchema, systemPrompt } from '../src/main/ai/lines/prompt.ts'
import { mixedLine, pairReading, written } from '../src/shared/levels.ts'

// Japanese and Korean phrases come with their reading; Spanish ones don't need one.
const phrase = { source: '映画', english: 'a movie', job: 'n', reading: 'eiga' }
const reply = (phrases) => ({ lines: [{ translation: 'I watched a movie.', phrases }] })
assert.equal(linesOutputSchema('ja').safeParse(reply([phrase])).success, true)
assert.equal(linesOutputSchema('ja').safeParse(reply([{ ...phrase, reading: undefined }])).success, false, 'Japanese needs readings')
assert.equal(linesOutputSchema('ko').safeParse(reply([phrase])).success, true)
assert.equal(linesOutputSchema('es').safeParse(reply([{ source: 'película', english: 'movie', job: 'n' }])).success, true)
assert.match(systemPrompt('ja'), /reading/, 'the Japanese prompt asks for readings')
assert.doesNotMatch(systemPrompt('es'), /reading:/, 'the Spanish prompt does not')

// The reading stays with the phrase's word on the line.
const line = alignLine('映画を見た。', 'I watched a movie.', [
  { source: '映画', english: 'a movie', job: 'n', reading: 'eiga' },
  { source: '見た', english: 'watched', job: 'v', reading: 'mita' }
])
const movie = line.source.find((token) => token.text === '映画')
assert.equal(movie.reading, 'eiga')
assert.equal(line.english.find((token) => token.text === 'a movie').reading, undefined, 'English words have none')
assert.equal(pairReading(line.source, movie.pair), 'eiga')
assert.equal(pairReading(alignLine('Vi una película.', 'I saw a movie.', [{ source: 'película', english: 'movie', job: 'n' }]).source, 1), undefined)

// On the strip, a word is written in its own script, or in its reading when that is chosen.
assert.equal(written(movie, 'native'), '映画')
assert.equal(written(movie, 'reading'), 'eiga')
assert.equal(written({ text: 'película', job: 'n', pair: 1, space: true }, 'reading'), 'película', 'no reading: as written')

// The words swapped into the English line keep their reading, so the strip can write them in it.
const mixed = mixedLine(line, 1)
const swapped = mixed.find((token) => token.swapped)
assert.equal(swapped?.text, '映画')
assert.equal(written(swapped, 'reading'), 'eiga', 'a swapped word is written in its reading when chosen')

console.log('Line task and reading tests passed.')
