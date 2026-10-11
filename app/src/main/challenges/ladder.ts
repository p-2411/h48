// The rungs of the words in lines the learner met, for picking practice by them (pick.ts), read
// from the knowledge ladder (src/main/knowledge) once per pick.
import { pairKeys, type WordState } from '../../shared/knowledge'
import type { Language } from '../../shared/types'
import type { Knowledge } from '../knowledge'
import type { MetLine } from '../watchlog'
import type { StateOf } from './pick'

/** Each word's rung in `lines`, by line and pair; undefined when the ladder can't be read, so
 * practice is picked as it was before the ladder. */
export function ladderOf(knowledge: Pick<Knowledge, 'statesFor'> | undefined, language: Language, lines: MetLine[]): StateOf | undefined {
  if (!knowledge) return undefined
  const keys = new Map(lines.map((line) => [line, new Map(pairKeys(language, line.processed).map((word) => [word.pair, word.key]))]))
  const all = [...new Set([...keys.values()].flatMap((pairs) => [...pairs.values()]))]
  let states: Record<string, WordState>
  try {
    states = knowledge.statesFor(language, all)
  } catch (error) {
    console.error('[duet] could not read the knowledge ladder', error)
    return undefined
  }
  return (line, pair) => states[keys.get(line)?.get(pair) ?? ''] ?? 'unknown'
}
