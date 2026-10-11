// The knowledge ladder: how well the learner knows each word, from what Duet has seen them do with
// it. A word (by its dictionary form, so "fue" and "voy" are both "ir") is
//   unknown      not met yet
//   encountered  met on screen, or looked up
//   known        its meaning is clear: its card is remembered well (FSRS), or, with no card, it was
//                recalled right on two different days
//   speakable    known, and said well on two different days
//   usable       speakable, and used well in the learner's own sentences, in two different contexts
//   ignored      left out of colouring and practice (names and grammar words, or the learner's choice)
// The rung is worked out from the evidence each time, never stored, so forgetting moves a word back
// down: a card fading in memory, or a miss or a poor try last time. Pure, for tests.
import { pairText } from './levels'
import type { Language, ProcessedLine, WordJob } from './types'

export type WordState = 'unknown' | 'encountered' | 'known' | 'speakable' | 'usable' | 'ignored'

/** The rungs in order, lowest first (ignored is off the ladder). */
export const LADDER: Exclude<WordState, 'ignored'>[] = ['unknown', 'encountered', 'known', 'speakable', 'usable']

/** Each rung as the learner reads it. */
export const STATE_LABELS: Record<WordState, string> = {
  unknown: 'New to you',
  encountered: 'Seen before',
  known: 'Known',
  speakable: 'You can say it',
  usable: 'You can use it',
  ignored: 'Ignored'
}

/** A try at something, right or not, and when. */
export type Attempt = { at: number; good: boolean }

/** What Duet knows about the learner and one word. */
export type WordEvidence = {
  /** How many times it was on screen. */
  seen: number
  /** Left out of colouring and practice. */
  ignored?: boolean
  /** Picked (or not) in a recall challenge. */
  recalls: Attempt[]
  /** Said in a line, as the coach heard it. */
  says: Attempt[]
  /** Used in the learner's own sentence, and that sentence (one context each). */
  uses: (Attempt & { context: string })[]
  /** Its card, when it has one: reviewed at least once, and the chance it's remembered now. */
  card?: { reviewed: boolean; retrievability: number }
}

// A card remembered with at least this chance makes the word known.
export const KNOWN_RETRIEVABILITY = 0.8
// Each rung up needs this many good tries on different days (or, for using, in different sentences).
const TIMES = 2

/** The key a word is kept under: its language and its dictionary form, as written in the language. */
export function wordKey(language: Language, base: string): string {
  return `${language}:${base.normalize('NFC').trim().toLocaleLowerCase()}`
}

const dayOf = (at: number): string => new Date(at).toDateString()

/** Good tries on enough different days (or contexts), with the latest try good. */
function earned<T extends Attempt>(attempts: T[], apart: (attempt: T) => string): boolean {
  if (!attempts.length) return false
  const latest = attempts.reduce((last, attempt) => (attempt.at >= last.at ? attempt : last))
  if (!latest.good) return false
  return new Set(attempts.filter((attempt) => attempt.good).map(apart)).size >= TIMES
}

/** The word's rung, from the evidence. */
export function wordState(evidence: WordEvidence): WordState {
  if (evidence.ignored) return 'ignored'
  const known = evidence.card?.reviewed
    ? evidence.card.retrievability >= KNOWN_RETRIEVABILITY
    : earned(evidence.recalls, (attempt) => dayOf(attempt.at))
  if (!known) {
    const met = evidence.seen > 0 || evidence.recalls.length > 0 || evidence.says.length > 0 || !!evidence.card
    return met ? 'encountered' : 'unknown'
  }
  if (!earned(evidence.says, (attempt) => dayOf(attempt.at))) return 'known'
  if (!earned(evidence.uses, (attempt) => attempt.context.trim().toLocaleLowerCase())) return 'speakable'
  return 'usable'
}

/** A line's words, each by its key: its dictionary form (or, for a line from before the line model
 * gave it, its words as written), with its job (names and grammar words start ignored). */
export function pairKeys(language: Language, line: ProcessedLine): { pair: number; key: string; text: string; job: WordJob }[] {
  const seen = new Set<number>()
  const out: { pair: number; key: string; text: string; job: WordJob }[] = []
  for (const token of line.source) {
    if (token.pair === null || seen.has(token.pair)) continue
    seen.add(token.pair)
    const text = pairText(line.source, token.pair)
    out.push({ pair: token.pair, key: wordKey(language, token.base ?? text), text, job: token.job })
  }
  return out
}

/** The Words place: how many words are on each rung, and the words (the last seen first). `word` is
 * the dictionary form; `seenAs` the form last seen on screen. */
export type WordsSummary = {
  counts: Record<WordState, number>
  words: { key: string; word: string; seenAs: string; state: WordState }[]
}

/** Jobs whose words start ignored: names, and grammar words. */
export const IGNORED_JOBS: WordJob[] = ['x', 'g']
