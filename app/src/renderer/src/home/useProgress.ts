// Progress in the language being learnt, for Watching and its tile: loaded like any home data
// (useLoaded), and again whenever a word moves. The numbers are extra: while they can't be loaded
// (or the settings can't be read) there are none, and the videos show without them.
import { useCallback, useEffect } from 'react'
import type { ProgressSummary } from '../../../shared/progress'
import type { Language } from '../../../shared/types'
import { useSettings } from '../components/useSettings'
import { useLoaded } from './useLoaded'

export function useProgress(): ProgressSummary | undefined {
  const language = useSettings()?.language
  // Each summary with the language it is for: video keys are the same in every language, so one
  // language's numbers must never show while another is learnt (a reload that fails keeps the last).
  const load = useCallback(
    (): Promise<{ language: Language; summary: ProgressSummary }> =>
      language
        ? window.duet.progress.summary(language).then((summary) => ({ language, summary }))
        : new Promise(() => undefined),
    [language]
  )
  const { value, reload } = useLoaded(load, 'Could not load how much you understand.')
  useEffect(() => window.duet.knowledge.onChanged(reload), [reload])
  return value?.language === language ? value?.summary : undefined
}
