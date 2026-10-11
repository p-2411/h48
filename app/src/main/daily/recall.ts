// "Recall a word": a line the learner met, with one word blanked, and three words to choose from
// (the word and two others that do the same job, from the learner's own lines).
import { joinTokens, pairText } from '../../shared/levels'
import type { ProcessedLine, Token } from '../../shared/types'

export type RecallChallenge = {
  /** The line before and after the blank, as written. */
  before: string
  after: string
  /** Whether a space comes before and after the blank. */
  spaceBefore: boolean
  spaceAfter: boolean
  /** Three words, in a random order; one is the answer. */
  choices: string[]
  answer: string
}

/** Every pair in a line, written out (what the strip names), with the job its words do. */
function pairsOf(line: ProcessedLine): { text: string; job: Token['job'] }[] {
  const seen = new Set<number>()
  const pairs: { text: string; job: Token['job'] }[] = []
  for (const token of line.source) {
    if (token.pair === null || seen.has(token.pair)) continue
    seen.add(token.pair)
    pairs.push({ text: pairText(line.source, token.pair), job: token.job })
  }
  return pairs
}

/** `count` items taken from `items` at random (or fewer, when there aren't enough). */
function take<T>(items: T[], count: number, random: () => number): T[] {
  const left = [...items]
  const taken: T[] = []
  while (taken.length < count && left.length) taken.push(left.splice(Math.floor(random() * left.length), 1)[0])
  return taken
}

/** The line with `pair` blanked; undefined when its words aren't together in the line, or there
 * aren't two other words to choose from. */
export function recallChallenge(
  line: ProcessedLine,
  pair: number,
  others: ProcessedLine[],
  random: () => number
): RecallChallenge | undefined {
  const at = line.source.flatMap((token, index) => (token.pair === pair ? [index] : []))
  if (!at.length || at.at(-1)! - at[0] + 1 !== at.length) return undefined
  const answer = pairText(line.source, pair)
  const job = line.source[at[0]].job
  // Other words, the same job first (so the blank can't be told by its shape), then any.
  const pool = [...new Map([line, ...others].flatMap(pairsOf).filter((item) => item.text !== answer).map((item) => [item.text, item])).values()]
  const sameJob = take(pool.filter((item) => item.job === job), 2, random)
  const rest = take(pool.filter((item) => item.job !== job), 2 - sameJob.length, random)
  const wrong = [...sameJob, ...rest].map((item) => item.text)
  if (wrong.length < 2) return undefined
  return {
    before: joinTokens(line.source.slice(0, at[0])),
    after: joinTokens(line.source.slice(at.at(-1)! + 1)),
    spaceBefore: at[0] > 0 && line.source[at[0] - 1].space,
    spaceAfter: line.source[at.at(-1)!].space,
    choices: take([answer, ...wrong], 3, random),
    answer
  }
}
