// Progress in the language being learnt, for Watching and its tile: loaded like any home data
// (useLoaded), and again whenever a word moves. The numbers are extra: while they can't be loaded
// (or the settings can't be read) there are none, and the videos show without them.
import { useCallback, useEffect } from 'react'
import type { ProgressSummary } from '../../../shared/progress'
import { useSettings } from '../components/useSettings'
import { useLoaded } from './useLoaded'

export function useProgress(): ProgressSummary | undefined {
  const language = useSettings()?.language
  const load = useCallback(
    (): Promise<ProgressSummary> =>
      language
        ? window.duet.progress.summary(language)
        : new Promise<ProgressSummary>(() => undefined),
    [language]
  )
  const { value, reload } = useLoaded(load, 'Could not load how much you understand.')
  useEffect(() => window.duet.knowledge.onChanged(reload), [reload])
  return value
}
