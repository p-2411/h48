// How well the learner knows the words of some lines (the knowledge ladder, src/main/knowledge).
// Rungs are remembered for the whole window (the same words come back line after line, so a new line
// shows its colours at once): a new set of lines asks only for the words not known yet, and whenever
// something the learner did may have moved a word, all of them are asked for again. Until a word's
// rung arrives (or the language is known) it is taken as new (white), or ignored for names and
// grammar words.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pairKeys, startsIgnored, type WordState } from '../../../shared/knowledge'
import type { Language, ProcessedLine, WordJob } from '../../../shared/types'

/** A word of a line: its key on the ladder, and its job. */
type LineWord = { key: string; job: WordJob }

export type WordStates = {
  /** A word's rung, by its line and pair. */
  stateOf: (line: ProcessedLine, pair: number | null) => WordState
  /** A word's key and job, by its line and pair. */
  wordOf: (line: ProcessedLine, pair: number | null) => LineWord | undefined
}

// Asked for at most this many at once (main takes a few thousand).
const BATCH = 2_000

// Each language's rungs, as last told, for every page of this window.
const remembered = new Map<Language, Record<string, WordState>>()
// Each line's words by pair, worked out once.
const keyed = new WeakMap<ProcessedLine, { language: Language; words: Map<number, LineWord> }>()

function wordsOf(language: Language, line: ProcessedLine): Map<number, LineWord> {
  let entry = keyed.get(line)
  if (entry?.language !== language) {
    entry = { language, words: new Map(pairKeys(language, line).map((word) => [word.pair, { key: word.key, job: word.job }])) }
    keyed.set(line, entry)
  }
  return entry.words
}

async function ask(language: Language, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += BATCH) {
    const next = await window.duet.knowledge.states(language, keys.slice(start, start + BATCH))
    remembered.set(language, { ...remembered.get(language), ...next })
  }
}

export function useWordStates(language: Language | undefined, lines: (ProcessedLine | undefined)[]): WordStates {
  const keys = useMemo(
    () => (language ? [...new Set(lines.flatMap((line) => (line ? [...wordsOf(language, line).values()].map((word) => word.key) : [])))] : []),
    [language, lines]
  )
  // Rungs arrived: show them.
  const [, setTold] = useState(0)
  const [changes, setChanges] = useState(0)
  useEffect(() => window.duet.knowledge.onChanged(() => setChanges((count) => count + 1)), [])
  const askedAt = useRef(0)
  useEffect(() => {
    if (!language || !keys.length) return
    const known = remembered.get(language) ?? {}
    const everything = askedAt.current !== changes
    askedAt.current = changes
    const wanted = everything ? keys : keys.filter((key) => !(key in known))
    if (!wanted.length) return
    let current = true
    ask(language, wanted).then(
      () => current && setTold((count) => count + 1),
      (error) => console.error('[duet] could not read how well the words are known', error)
    )
    return () => {
      current = false
    }
  }, [language, keys, changes])
  const wordOf = useCallback<WordStates['wordOf']>(
    (line, pair) => (language && pair !== null ? wordsOf(language, line).get(pair) : undefined),
    [language]
  )
  const stateOf: WordStates['stateOf'] = (line, pair) => {
    if (pair === null) return 'ignored'
    const word = wordOf(line, pair)
    if (!word || !language) return 'unknown'
    return remembered.get(language)?.[word.key] ?? (startsIgnored(word.job) ? 'ignored' : 'unknown')
  }
  return { stateOf, wordOf }
}
