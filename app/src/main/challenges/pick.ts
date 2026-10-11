// Picking challenges from lines the learner met, for the daily session and checkpoints: a line to
// say back, a word to recall (one the learner looked at: hovered or saved), and what a line meant.
// Pure, so it can be tested without the app.
import { pairText } from '../../shared/levels'
import type { MetLine } from '../watchlog'
import { recallChallenge, type RecallChallenge } from './recall'

// A line to say back has this many words at most: longer ones are a recitation, not a line.
const SAY_MAX_WORDS = 16

export type Challenge = { kind: 'recall'; line: MetLine; recall: RecallChallenge } | { kind: 'meaning'; line: MetLine }

/** The pairs of a line whose words the learner looked at. */
function lookedAt(line: MetLine, words: Set<string>): number[] {
  const pairs = new Set(line.processed.source.flatMap((token) => (token.pair === null ? [] : [token.pair])))
  return [...pairs].filter((pair) => words.has(pairText(line.processed.source, pair)))
}

/** The line to say back: the newest short enough, one with a word looked at first. */
export function pickSay(lines: MetLine[], looked: Set<string>): MetLine | undefined {
  const sayable = lines.filter((line) => line.processed.source.length >= 2 && line.processed.source.length <= SAY_MAX_WORDS)
  return sayable.find((line) => lookedAt(line, looked).length) ?? sayable[0]
}

/** A recall challenge on a word the learner looked at, from one of `pool` (the other choices from
 * any of `lines`); undefined when none can be made. */
export function findRecall(
  pool: MetLine[],
  lines: MetLine[],
  looked: Set<string>,
  random: () => number
): Extract<Challenge, { kind: 'recall' }> | undefined {
  for (const line of pool) {
    for (const pair of lookedAt(line, looked)) {
      const rest = lines.filter((item) => item !== line).map((item) => item.processed)
      const recall = recallChallenge(line.processed, pair, rest, random)
      if (recall) return { kind: 'recall', line, recall }
    }
  }
  return undefined
}

/** A checkpoint's one challenge, from the last few minutes' lines (newest first): recall a word the
 * learner looked at; else, by chance, a line said back or what another line meant. */
export function pickCheckpoint({ lines, words }: { lines: MetLine[]; words: string[] }, random: () => number): { say?: MetLine; challenge?: Challenge } {
  const recall = findRecall(lines, lines, new Set(words), random)
  if (recall) return { challenge: recall }
  const say = pickSay(lines, new Set())
  if (say && random() < 0.5) return { say }
  const line = lines.find((item) => item !== say) ?? lines[0]
  return line ? { challenge: { kind: 'meaning', line } } : {}
}
