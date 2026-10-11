// How well the learner knows the words of some lines (the knowledge ladder, src/main/knowledge):
// asked for once per set of lines, again whenever something the learner did may have moved a word,
// and remembered between lines (the same words come back). Until a word's rung arrives it is taken
// as new (white), or ignored for names and grammar words.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IGNORED_JOBS, pairKeys, type WordState } from '../../../shared/knowledge'
import type { Language, ProcessedLine } from '../../../shared/types'

/** A word's rung, by its line and pair. */
export type StateOf = (line: ProcessedLine, pair: number | null) => WordState

export function useWordStates(language: Language, lines: (ProcessedLine | undefined)[]): StateOf {
  const words = useMemo(() => lines.flatMap((line) => (line ? pairKeys(language, line) : [])), [language, lines])
  const keys = useMemo(() => [...new Set(words.map((word) => word.key))], [words])
  const [states, setStates] = useState<Record<string, WordState>>({})
  const [asked, setAsked] = useState(0)
  useEffect(() => window.duet.knowledge.onChanged(() => setAsked((count) => count + 1)), [])
  useEffect(() => {
    if (!keys.length) return
    let current = true
    window.duet.knowledge.states(language, keys).then(
      (next) => current && setStates((known) => ({ ...known, ...next })),
      () => undefined
    )
    return () => {
      current = false
    }
  }, [language, keys, asked])
  return useCallback<StateOf>(
    (line, pair) => {
      if (pair === null) return 'ignored'
      const word = pairKeys(language, line).find((item) => item.pair === pair)
      if (!word) return 'unknown'
      return states[word.key] ?? (IGNORED_JOBS.includes(word.job) ? 'ignored' : 'unknown')
    },
    [language, states]
  )
}
