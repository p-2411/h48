// Your words' one list: the ladder's words (knowledge.summary) joined with the cards by word key. A
// word with cards lists them under it; a card whose word is not on the ladder (a phrase card) is a
// row of its own, by its card, after the words; so is a card in another language (learnt before, or
// alongside), marked with its language. Then the search and filters over the rows. Pure, for tests
// (scripts/test-words-join.mjs).
import type { Card } from '../../../../shared/cards'
import { wordKey, type WordsSummary, type WordState } from '../../../../shared/knowledge'
import type { Language } from '../../../../shared/types'

/** One row: a word on the ladder (with its cards, if any), or a card's word that is not on it. */
export type WordItem = {
  /** The word key (shared/knowledge.ts wordKey); a card row has its card's. */
  key: string
  /** As the row shows it: the dictionary form, or a card row's expression. */
  text: string
  /** The form last seen on screen (words only). */
  seenAs?: string
  /** Its rung; none for a card row. */
  state?: WordState
  /** A card row in another language than the one learnt now: that language. */
  language?: Language
  /** Its cards, newest first. */
  cards: Card[]
  /** One of its cards is due now. */
  due: boolean
  /** One of its cards is paused. */
  paused: boolean
}

/** The segment (all, due, has a card, paused), the rung, and the search; all must match. */
export type WordFilter = {
  show: 'all' | 'due' | 'card' | 'paused'
  rung?: WordState
  search?: string
}

/** A card to review now: reviewed before, not paused, and its time has come. */
export function isDue(card: Card, now = Date.now()): boolean {
  return !card.paused && card.state !== 'new' && card.due <= now
}

const keyOf = (card: Card): string => card.wordKey ?? wordKey(card.language, card.expression)

function item(
  key: string,
  text: string,
  cards: Card[],
  now: number,
  word?: WordsSummary['words'][number],
  language?: Language
): WordItem {
  return {
    key,
    text,
    seenAs: word?.seenAs,
    state: word?.state,
    language,
    cards,
    due: cards.some((card) => isDue(card, now)),
    paused: cards.some((card) => card.paused)
  }
}

/** The words (in the summary's order, the last seen first), then the cards with no word on the
 * ladder (newest first): this language's first, then other languages'. */
export function joinWords(
  words: WordsSummary['words'],
  cards: Card[],
  language: Language,
  now = Date.now()
): WordItem[] {
  const byKey = new Map<string, Card[]>()
  const newestFirst = [...cards].sort(
    (a, b) => Number(a.language !== language) - Number(b.language !== language) || b.createdAt - a.createdAt
  )
  for (const card of newestFirst) {
    const key = keyOf(card)
    byKey.set(key, [...(byKey.get(key) ?? []), card])
  }
  const rows = words.map((word) => item(word.key, word.word, byKey.get(word.key) ?? [], now, word))
  const onLadder = new Set(words.map((word) => word.key))
  for (const [key, own] of byKey)
    if (!onLadder.has(key))
      rows.push(item(key, own[0].expression, own, now, undefined, own[0].language === language ? undefined : own[0].language))
  return rows
}

const fold = (text: string): string => text.normalize('NFC').toLocaleLowerCase()

/** Everything a search looks in: the word, the form seen, and its cards' text. */
function haystack(row: WordItem): string {
  const parts = [row.text, row.seenAs ?? '']
  for (const card of row.cards)
    parts.push(
      card.expression,
      card.reading ?? '',
      card.meaning,
      card.target,
      card.situation ?? '',
      card.alternative ?? '',
      card.note ?? ''
    )
  return fold(parts.join('\n'))
}

/** The rows that match. Ignored words show only under their own rung. */
export function filterWords(rows: WordItem[], filter: WordFilter): WordItem[] {
  const search = fold(filter.search?.trim() ?? '')
  return rows.filter((row) => {
    if (filter.rung ? row.state !== filter.rung : row.state === 'ignored') return false
    if (filter.show === 'card' && !row.cards.length) return false
    if (filter.show === 'due' && !row.due) return false
    if (filter.show === 'paused' && !row.paused) return false
    return !search || haystack(row).includes(search)
  })
}
