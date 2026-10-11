// The knowledge ladder's bridge (src/main/knowledge): how well the learner knows each word.
import type { WordsSummary, WordState } from '../shared/knowledge'
import type { Language } from '../shared/types'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const knowledgeApi = {
  /** Each word's rung now, by key (shared/knowledge.ts wordKey). */
  states: (language: Language, keys: string[]) => invoke<Record<string, WordState>>('knowledge:states', language, keys),
  /** Leaves a word out of colouring and practice, or brings it back. */
  setIgnored: (language: Language, key: string, ignored: boolean) => invoke<void>('knowledge:set-ignored', language, key, ignored),
  /** Every word met in the language: how many on each rung, and the last seen (the Words place). */
  summary: (language: Language) => invoke<WordsSummary>('knowledge:summary', language),
  /** Something the learner did may have moved a word. */
  onChanged: (listener: () => void) => subscribe('knowledge:changed', listener)
}
