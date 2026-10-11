// What goes in the daily session, from the last video watched: up to SESSION_CARDS due cards (about
// 5 minutes), one line to say back, and one challenge: recall a word, what a line meant, or use it
// (the picking: src/main/challenges/pick.ts). With the knowledge ladder, lines whose words are all
// usable are left out; a line whose words are all sayable is said back and then used, in a sentence
// of the learner's own; else the line said back is one whose words are all known (or, with none,
// any line, as without the ladder), and the word recalled one only met. Pure, so it can be tested
// without the app.
import { findRecall, lineNeed, pairsOf, pickSay, type Challenge, type StateOf } from '../challenges/pick'
import type { MetLine } from '../watchlog'

// About 5 minutes of reviews, at 20 to 25 seconds a card.
export const SESSION_CARDS = 12

type SessionPlan = { cards: number; say?: MetLine; challenge?: Challenge }

/** The plan for today's session. `lines` are the last video's, newest first; `words` what the
 * learner looked at in it; `stateOf` each word's rung, when the ladder is known. */
export function planSession({
  due,
  lines,
  words,
  random,
  stateOf
}: {
  due: number
  lines: MetLine[]
  words: string[]
  random: () => number
  stateOf?: StateOf
}): SessionPlan {
  const cards = Math.min(due, SESSION_CARDS)
  const live = stateOf ? lines.filter((line) => lineNeed(line, stateOf) !== 'done') : lines
  if (!live.length) return { cards }
  const looked = new Set(words)
  const sayable = stateOf && pickSay(live.filter((line) => lineNeed(line, stateOf) === 'produce'), looked)
  if (sayable) {
    const pairs = pairsOf(sayable).filter((pair) => stateOf(sayable, pair) !== 'ignored')
    return { cards, say: sayable, challenge: { kind: 'produce', line: sayable, pairs } }
  }
  const known = stateOf && pickSay(live.filter((line) => lineNeed(line, stateOf) === 'say'), looked)
  const say = known ?? pickSay(live, looked)
  // The challenge uses another line when there is one, so it isn't the line just said back.
  const others = live.filter((line) => line !== say)
  const pool = others.length ? others : live
  const recall = findRecall(pool, lines, looked, random, stateOf)
  return { cards, say, challenge: recall ?? { kind: 'meaning', line: pool[0] } }
}
