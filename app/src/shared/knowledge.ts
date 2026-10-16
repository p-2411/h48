// The knowledge ladder: how well the learner knows each word, from what Duet has seen them do with
// it. A word (by its dictionary form, so "fue" and "voy" are both "ir") is
//   unknown      not met yet
//   encountered  met on screen, tried in a challenge, or given a card
//   known        its meaning is clear: its card is past learning and remembered well (FSRS), or,
//                without such a card, it was recalled right on two different days; a recall missed
//                last time always means not known
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
  encountered: 'Heard',
  known: 'Known',
  speakable: 'You can say it',
  usable: 'You can use it',
  ignored: 'Ignored'
}

/** A try at something, right or not, and when. */
type Attempt = { at: number; good: boolean }

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
  /** Its card, when it has one: whether it is past learning (FSRS state Review: a card just failed or
   * still being learnt reads as remembered all day), and the chance it's remembered now. */
  card?: { inReview: boolean; retrievability: number }
}

// A card remembered with at least this chance makes the word known.
const KNOWN_RETRIEVABILITY = 0.8
// Each rung up needs this many good tries on different days (or, for using, in different sentences).
const TIMES = 2

/** The key a word is kept under: its language and its dictionary form, as written in the language. */
export function wordKey(language: Language, base: string): string {
  return `${language}:${base.normalize('NFC').trim().toLocaleLowerCase()}`
}

/** The word a key names (its dictionary form), when the key is one of `language`'s. */
export function keyWord(language: Language, key: string): string | undefined {
  return key.startsWith(`${language}:`) ? key.slice(language.length + 1) : undefined
}

/** A rung's place on the ladder (ignored, off it, counts as the top: it never holds anything back). */
export function rank(state: WordState): number {
  return state === 'ignored' ? LADDER.length : LADDER.indexOf(state)
}


const dayOf = (at: number): string => new Date(at).toDateString()

/** The latest of some tries. */
const latestOf = <T extends Attempt>(attempts: T[]): T | undefined =>
  attempts.reduce<T | undefined>((last, attempt) => (!last || attempt.at >= last.at ? attempt : last), undefined)

/** Good tries on enough different days (or contexts), with the latest try good. */
function earned<T extends Attempt>(attempts: T[], apart: (attempt: T) => string): boolean {
  if (!latestOf(attempts)?.good) return false
  return new Set(attempts.filter((attempt) => attempt.good).map(apart)).size >= TIMES
}

/** The word's rung, from the evidence. */
export function wordState(evidence: WordEvidence): WordState {
  if (evidence.ignored) return 'ignored'
  const missedLast = latestOf(evidence.recalls)?.good === false
  const known =
    !missedLast &&
    (evidence.card?.inReview ? evidence.card.retrievability >= KNOWN_RETRIEVABILITY : earned(evidence.recalls, (attempt) => dayOf(attempt.at)))
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
const IGNORED_JOBS: WordJob[] = ['x', 'g']

/** Whether a word with this job is left out until the learner brings it back. */
export function startsIgnored(job: WordJob): boolean {
  return IGNORED_JOBS.includes(job)
}
