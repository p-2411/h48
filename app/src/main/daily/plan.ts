// What goes in the daily session, from the last video watched: up to SESSION_CARDS due cards (about
// 5 minutes), one line to say back, and one challenge: recall a word the learner looked at, or,
// when they looked at none, what a line meant. Pure, so it can be tested without the app.
import { pairText } from '../../shared/levels'
import type { MetLine } from '../watchlog'
import { recallChallenge, type RecallChallenge } from './recall'

// About 5 minutes of reviews, at 20 to 25 seconds a card.
export const SESSION_CARDS = 12
// A line to say back has this many words at most: longer ones are a recitation, not a line.
const SAY_MAX_WORDS = 16


export type SessionChallenge = { kind: 'recall'; line: MetLine; recall: RecallChallenge } | { kind: 'meaning'; line: MetLine }

export type SessionPlan = { cards: number; say?: MetLine; challenge?: SessionChallenge }

/** The pairs of a line whose words the learner looked at (hovered or saved). */
function lookedAt(line: MetLine, words: Set<string>): number[] {
  const pairs = new Set(line.processed.source.flatMap((token) => (token.pair === null ? [] : [token.pair])))
  return [...pairs].filter((pair) => words.has(pairText(line.processed.source, pair)))
}

/** The plan for today's session. `lines` are the last video's, newest first; `words` what the
 * learner looked at in it. */
export function planSession({
  due,
  lines,
  words,
  random
}: {
  due: number
  lines: MetLine[]
  words: string[]
  random: () => number
}): SessionPlan {
  const cards = Math.min(due, SESSION_CARDS)
  if (!lines.length) return { cards }
  const looked = new Set(words)
  const sayable = lines.filter((line) => line.processed.source.length >= 2 && line.processed.source.length <= SAY_MAX_WORDS)
  const say = sayable.find((line) => lookedAt(line, looked).length) ?? sayable[0]
  // The challenge uses another line when there is one, so it isn't the line just said back.
  const others = lines.filter((line) => line !== say)
  const pool = others.length ? others : lines
  const recall = findRecall(pool, lines, looked, random)
  return { cards, say, challenge: recall ?? { kind: 'meaning', line: pool[0] } }
}

/** A recall challenge on a word the learner looked at, from one of `pool` (the other choices from
 * any of `lines`); undefined when none can be made. */
export function findRecall(
  pool: MetLine[],
  lines: MetLine[],
  looked: Set<string>,
  random: () => number
): Extract<SessionChallenge, { kind: 'recall' }> | undefined {
  for (const line of pool) {
    for (const pair of lookedAt(line, looked)) {
      const rest = lines.filter((item) => item !== line).map((item) => item.processed)
      const recall = recallChallenge(line.processed, pair, rest, random)
      if (recall) return { kind: 'recall', line, recall }
    }
  }
  return undefined
}
