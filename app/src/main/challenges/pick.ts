// Picking challenges from lines the learner met, for the daily session and checkpoints: a line to
// say back, a word to recall, and what a line meant. With the knowledge ladder (`stateOf`), a line's
// words say what it needs (lineNeed); without it, recall is of a word the learner looked at (hovered
// or saved). Pure, so it can be tested without the app.
import { rank, type WordState } from '../../shared/knowledge'
import { pairText } from '../../shared/levels'
import type { MetLine } from '../watchlog'
import { recallChallenge, type RecallChallenge } from './recall'

// A line to say back has this many words at most: longer ones are a recitation, not a line.
const SAY_MAX_WORDS = 16

export type Challenge =
  | { kind: 'recall'; line: MetLine; recall: RecallChallenge }
  | { kind: 'meaning'; line: MetLine }
  /** Use it: the line, and the pairs whose words the learner's sentence may use (none ignored). */
  | { kind: 'produce'; line: MetLine; pairs: number[] }

/** A word's rung on the knowledge ladder, by its line and pair (src/shared/knowledge.ts). */
export type StateOf = (line: MetLine, pair: number) => WordState

/** What a line needs next: recall a word only met, say the line (every word known), use its words
 * in a sentence of one's own (every word sayable), or nothing (every word usable). */
type LineNeed = 'recall' | 'say' | 'produce' | 'done'

// What a line needs when its lowest word is on each rung, in the ladder's order (unknown, encountered,
// known, speakable, usable); ignored words, off the ladder, never hold a line back.
const NEEDS: LineNeed[] = ['recall', 'recall', 'say', 'produce', 'done']
const DONE = NEEDS.length - 1
const KNOWN = rank('known')

type Word = { line: MetLine; pair: number }

/** A line's pairs, once each. */
export function pairsOf(line: MetLine): number[] {
  return [...new Set(line.processed.source.flatMap((token) => (token.pair === null ? [] : [token.pair])))]
}

/** What the line needs, by its lowest word. */
export function lineNeed(line: MetLine, stateOf: StateOf): LineNeed {
  return NEEDS[Math.min(DONE, ...pairsOf(line).map((pair) => rank(stateOf(line, pair))))]
}

/** The pairs of a line whose words the learner looked at. */
function lookedAt(line: MetLine, words: Set<string>): number[] {
  return pairsOf(line).filter((pair) => words.has(pairText(line.processed.source, pair)))
}

/** The words to recall: with the ladder, those only met, the ones looked at first (across all the
 * lines); without it, those looked at. */
function recallCandidates(pool: MetLine[], looked: Set<string>, stateOf?: StateOf): Word[] {
  const seen = pool.flatMap((line) => lookedAt(line, looked).map((pair) => ({ line, pair })))
  if (!stateOf) return seen
  const onlyMet = ({ line, pair }: Word): boolean => rank(stateOf(line, pair)) < KNOWN
  const first = seen.filter(onlyMet)
  const rest = pool
    .flatMap((line) => pairsOf(line).map((pair) => ({ line, pair })))
    .filter((word) => onlyMet(word) && !first.some((one) => one.line === word.line && one.pair === word.pair))
  return [...first, ...rest]
}

/** The line to say back: the newest short enough, one with a word looked at first. */
export function pickSay(lines: MetLine[], looked: Set<string>): MetLine | undefined {
  const sayable = lines.filter((line) => line.processed.source.length >= 2 && line.processed.source.length <= SAY_MAX_WORDS)
  return sayable.find((line) => lookedAt(line, looked).length) ?? sayable[0]
}

/** A recall challenge from one of `pool` (the other choices from any of `lines`); undefined when
 * none can be made. */
export function findRecall(
  pool: MetLine[],
  lines: MetLine[],
  looked: Set<string>,
  random: () => number,
  stateOf?: StateOf
): Extract<Challenge, { kind: 'recall' }> | undefined {
  for (const { line, pair } of recallCandidates(pool, looked, stateOf)) {
    const rest = lines.filter((item) => item !== line).map((item) => item.processed)
    const recall = recallChallenge(line.processed, pair, rest, random)
    if (recall) return { kind: 'recall', line, recall }
  }
  return undefined
}

/** A checkpoint's one challenge, from the last few minutes' lines (newest first). With the ladder: a
 * line whose words are all known, said back; else a word only met, recalled; else what a line meant
 * (using words in one's own sentence is the daily session's). Without it: recall a word the learner
 * looked at; else, by chance, a line said back or what another line meant. */
export function pickCheckpoint(
  { lines, words }: { lines: MetLine[]; words: string[] },
  random: () => number,
  stateOf?: StateOf
): { say?: MetLine; challenge?: Exclude<Challenge, { kind: 'produce' }> } {
  if (stateOf) {
    const live = lines.filter((line) => ['recall', 'say'].includes(lineNeed(line, stateOf)))
    const say = pickSay(
      live.filter((line) => lineNeed(line, stateOf) === 'say'),
      new Set()
    )
    if (say) return { say }
    const recall = findRecall(live, lines, new Set(words), random, stateOf)
    if (recall) return { challenge: recall }
    const line = live[0] ?? lines[0]
    return line ? { challenge: { kind: 'meaning', line } } : {}
  }
  const recall = findRecall(lines, lines, new Set(words), random)
  if (recall) return { challenge: recall }
  const say = pickSay(lines, new Set())
  if (say && random() < 0.5) return { say }
  const line = lines.find((item) => item !== say) ?? lines[0]
  return line ? { challenge: { kind: 'meaning', line } } : {}
}
