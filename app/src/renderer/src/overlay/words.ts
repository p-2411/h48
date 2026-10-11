// Plain facts the strip shows about words and levels, in the learner's terms.
import { joinTokens } from '../../../shared/levels'
import type { Level, ProcessedLine, WordJob } from '../../../shared/types'

export const JOBS: Record<WordJob, string> = {
  n: 'thing',
  v: 'action',
  a: 'describing word',
  p: 'person or pointer',
  x: 'name',
  g: 'glue word'
}

/** How much of the language each level swaps in, named for what it does. */
export const LEVELS: { level: Level; name: string; adds: string }[] = [
  { level: 1, name: 'Few', adds: 'things' },
  { level: 2, name: 'Some', adds: 'things and actions' },
  { level: 3, name: 'More', adds: 'and describing words' },
  { level: 4, name: 'Most', adds: 'and people and names' },
  { level: 5, name: 'All', adds: 'the whole line' }
]

/** The two sides of a pair: the words in the language learnt and their English partner. */
export function pairOf(line: ProcessedLine, pair: number): { source: string; english: string } {
  return {
    source: joinTokens(line.source.filter((token) => token.pair === pair)),
    english: joinTokens(line.english.filter((token) => token.pair === pair))
  }
}
