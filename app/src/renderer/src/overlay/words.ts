// Plain facts the strip shows about words and levels, in the learner's terms.
import { pairText } from '../../../shared/levels'
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
export const LEVELS: { level: Level; mark: string; name: string; adds: string }[] = [
  { level: 0, mark: 'A', name: 'Auto', adds: 'things, and every word you know' },
  { level: 1, mark: '1', name: 'Few', adds: 'things' },
  { level: 2, mark: '2', name: 'Some', adds: 'things and actions' },
  { level: 3, mark: '3', name: 'More', adds: 'and describing words' },
  { level: 4, mark: '4', name: 'Most', adds: 'and people and names' },
  { level: 5, mark: '5', name: 'All', adds: 'the whole line' }
]

/** The two sides of a pair: the words in the language learnt and their English partner. */
export function pairOf(line: ProcessedLine, pair: number): { source: string; english: string } {
  return {
    source: pairText(line.source, pair),
    english: pairText(line.english, pair)
  }
}

/** The hover, if it is on this line. A hover outlives its line (the pointer can rest on the strip
 * while the next line comes, with no new mouseenter), and the next line's word with the same pair
 * number was never pointed at. */
export function hoverOn<T extends { lineId: number }>(
  hover: T | undefined,
  lineId: number
): T | undefined {
  return hover?.lineId === lineId ? hover : undefined
}
