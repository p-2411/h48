// Checks how Your words joins the ladder's words with the cards (renderer/home/words/join.ts): a word
// with its card or cards, a card whose word is not on the ladder as its own row, and the search and
// filters over both. Run: npx jiti scripts/test-words-join.mjs
import assert from 'node:assert/strict'
import { filterWords, isDue, joinWords } from '../src/renderer/src/home/words/join.ts'

const NOW = Date.UTC(2026, 9, 12, 12)
const DAY = 86_400_000

let made = 0
const card = (fields) => {
  made++
  return {
    id: `c${made}`,
    language: 'es',
    type: 'understand',
    expression: 'x',
    meaning: '',
    target: 'x',
    source: { kind: 'tutor' },
    revision: 1,
    paused: false,
    state: 'review',
    due: NOW + DAY,
    reps: 1,
    lapses: 0,
    createdAt: NOW - made * DAY,
    updatedAt: NOW,
    ...fields
  }
}
const word = (base, state, seenAs = base) => ({ key: `es:${base}`, word: base, seenAs, state })

const words = [
  word('ir', 'known', 'fue'),
  word('casa', 'speakable'),
  word('perro', 'encountered'),
  word('el', 'ignored')
]
const goCard = card({ expression: 'fue', meaning: 'went', wordKey: 'es:ir', due: NOW - DAY })
const houseCard = card({
  expression: 'casa',
  meaning: 'house',
  wordKey: 'es:casa',
  note: 'feminine'
})
const houseCard2 = card({
  expression: 'en casa',
  meaning: 'at home',
  wordKey: 'es:casa',
  paused: true,
  due: NOW - DAY
})
const phraseCard = card({
  expression: 'Tal vez',
  meaning: 'maybe',
  wordKey: 'es:tal vez',
  reading: 'tal beth'
})
// A card from before the ladder named a word: its word is its expression's.
const oldCard = card({ expression: 'Perro', meaning: 'dog' })
// A card in another language (learnt before, or alongside): still listed, as its own card row.
const otherCard = card({ language: 'ja', expression: '犬', meaning: 'dog', wordKey: 'ja:犬' })
const cards = [goCard, houseCard, houseCard2, phraseCard, oldCard, otherCard]

const items = joinWords(words, cards, 'es', NOW)
const byKey = (key) => items.find((item) => item.key === key)

// A word with one card: the card is listed under the word, and the word keeps its rung.
const go = byKey('es:ir')
assert.deepEqual(
  go.cards.map((c) => c.id),
  [goCard.id]
)
assert.equal(go.state, 'known')
assert.equal(go.text, 'ir', 'a word row shows the dictionary form')
assert.equal(go.seenAs, 'fue')
assert.equal(go.due, true, 'its card is due')

// A word with two cards: both under it, one row.
const house = byKey('es:casa')
assert.deepEqual(
  house.cards.map((c) => c.id),
  [houseCard.id, houseCard2.id]
)
assert.equal(items.filter((item) => item.key === 'es:casa').length, 1)
assert.equal(house.paused, true, 'one of its cards is paused')
assert.equal(house.due, false, 'a paused card is not due')

// A card whose word is not on the ladder: its own row, by its card, with no rung.
const phrase = byKey('es:tal vez')
assert.ok(phrase, 'the phrase card has a row')
assert.equal(phrase.state, undefined)
assert.equal(phrase.text, 'Tal vez')
assert.deepEqual(
  phrase.cards.map((c) => c.id),
  [phraseCard.id]
)
assert.ok(items.indexOf(phrase) > items.indexOf(byKey('es:el')), 'card rows come after the words')

// A card with no word key joins the word of its expression.
assert.deepEqual(
  byKey('es:perro').cards.map((c) => c.id),
  [oldCard.id]
)

// A word with no card: its row, with no cards.
assert.deepEqual(byKey('es:el').cards, [])
assert.equal(byKey('es:el').due, false)

// Another language's cards stay, after this language's rows, marked with their language; every word
// and card row is there once, words first in order.
assert.deepEqual(byKey('ja:犬').cards.map((c) => c.id), [otherCard.id])
assert.equal(byKey('ja:犬').language, 'ja')
assert.equal(byKey('es:tal vez').language, undefined, 'rows in this language name no language')
assert.deepEqual(
  items.map((item) => item.key),
  ['es:ir', 'es:casa', 'es:perro', 'es:el', 'es:tal vez', 'ja:犬']
)

// Due: reviewed cards whose time has come; not new cards, not paused ones.
assert.equal(isDue(goCard, NOW), true)
assert.equal(isDue({ ...goCard, state: 'new' }, NOW), false)
assert.equal(isDue({ ...goCard, paused: true }, NOW), false)
assert.equal(isDue(houseCard, NOW), false)

const keys = (filter) => filterWords(items, filter).map((item) => item.key)

// All: everything but the ignored words, which have their own filter.
assert.deepEqual(keys({ show: 'all' }), ['es:ir', 'es:casa', 'es:perro', 'es:tal vez', 'ja:犬'])
assert.deepEqual(keys({ show: 'all', rung: 'ignored' }), ['es:el'])
assert.deepEqual(keys({ show: 'all', rung: 'speakable' }), ['es:casa'])
assert.deepEqual(keys({ show: 'all', rung: 'encountered' }), ['es:perro'], 'a card row has no rung')

// Has a card, Due, Paused.
assert.deepEqual(keys({ show: 'card' }), ['es:ir', 'es:casa', 'es:perro', 'es:tal vez', 'ja:犬'])
assert.deepEqual(keys({ show: 'due' }), ['es:ir'])
assert.deepEqual(keys({ show: 'paused' }), ['es:casa'])
assert.deepEqual(keys({ show: 'card', rung: 'known' }), ['es:ir'], 'filters combine')

// Search: the word, the form seen, and the cards' text (expression, reading, meaning, note), any case.
assert.deepEqual(
  keys({ show: 'all', search: 'FUE' }),
  ['es:ir'],
  'the form it was seen as, or its card'
)
assert.deepEqual(keys({ show: 'all', search: 'went' }), ['es:ir'], "its card's meaning")
assert.deepEqual(keys({ show: 'all', search: 'at home' }), ['es:casa'], "its second card's meaning")
assert.deepEqual(keys({ show: 'all', search: 'feminine' }), ['es:casa'], "its card's note")
assert.deepEqual(keys({ show: 'all', search: 'beth' }), ['es:tal vez'], "a card's reading")
assert.deepEqual(keys({ show: 'all', search: 'perr' }), ['es:perro'], 'part of the word')
assert.deepEqual(
  keys({ show: 'all', search: '  ' }),
  keys({ show: 'all' }),
  'a blank search finds everything'
)
assert.deepEqual(keys({ show: 'due', search: 'house' }), [], 'search and filter combine')

// Nothing at all: no rows.
assert.deepEqual(joinWords([], [], 'es', NOW), [])

console.log('words join: ok')
