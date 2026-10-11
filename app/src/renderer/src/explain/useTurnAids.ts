// Help for Duet's turns in the language being learnt: the English meaning, shown when the learner
// presses Meaning, and the romanisation (for languages not written in Latin letters), fetched once
// each turn has settled.
import { useCallback, useEffect, useRef, useState } from 'react'
import { languageModule, speaks, type Language } from '../../../shared/languages'
import { aidRequester, type Aids } from './aids'
import type { TurnData } from './Turn'
import { TURN_SETTLE_MS } from './voice/timing'

export function useTurnAids(
  thread: TurnData[],
  language: Language
): {
  revealed: Set<string>
  meanings: Aids
  readings: Aids
  reveal: (id: string, text: string) => void
  hide: (id: string) => void
  /** Whether the learner ever showed this turn's meaning, even if it is hidden again now. */
  wasRevealed: (id: string) => boolean
} {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [meanings, setMeanings] = useState<Aids>({})
  const [readings, setReadings] = useState<Aids>({})
  const everRevealed = useRef(new Set<string>())
  // Made once, so each remembers what it asked for across renders.
  const [translate] = useState(() => aidRequester(setMeanings, { fallback: 'Could not show the meaning.', retry: true }))
  const [romanise] = useState(() => aidRequester(setReadings, { fallback: 'Could not show the romanisation.', retry: false }))

  // Romanisation for Duet's turns in the language, once each has settled. The key changes when a
  // turn arrives or grows; the ref hands the timer the turns as they are by then.
  const romanisable = languageModule(language).reading
    ? thread.filter((turn) => turn.from === 'duet' && speaks(language, turn.text))
    : []
  const key = romanisable.map((turn) => `${turn.id}:${turn.text.length}`).join('|')
  const latest = useRef(romanisable)
  useEffect(() => {
    latest.current = romanisable
  })
  useEffect(() => {
    if (!key) return
    const timer = window.setTimeout(() => {
      for (const { id, text } of latest.current) romanise(id, text, (source) => window.duet.tutor.romanise(source))
    }, TURN_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [key, romanise])

  const reveal = useCallback(
    (id: string, text: string): void => {
      setRevealed((current) => new Set(current).add(id))
      everRevealed.current.add(id)
      translate(id, text, (source) => window.duet.tutor.translate(source))
    },
    [translate]
  )

  const hide = useCallback((id: string): void => {
    setRevealed((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const wasRevealed = useCallback((id: string): boolean => everRevealed.current.has(id), [])

  return { revealed, meanings, readings, reveal, hide, wasRevealed }
}
