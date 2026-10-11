// What goes in the daily session, from the last video watched: up to SESSION_CARDS due cards (about
// 5 minutes), one line to say back, and one challenge: recall a word the learner looked at, or,
// when they looked at none, what a line meant (the picking: src/main/challenges/pick.ts). Pure, so it
// can be tested without the app.
import { findRecall, pickSay, type Challenge } from '../challenges/pick'
import type { MetLine } from '../watchlog'

// About 5 minutes of reviews, at 20 to 25 seconds a card.
export const SESSION_CARDS = 12

type SessionPlan = { cards: number; say?: MetLine; challenge?: Challenge }

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
  const say = pickSay(lines, looked)
  // The challenge uses another line when there is one, so it isn't the line just said back.
  const others = lines.filter((line) => line !== say)
  const pool = others.length ? others : lines
  const recall = findRecall(pool, lines, looked, random)
  return { cards, say, challenge: recall ?? { kind: 'meaning', line: pool[0] } }
}
