// The learner's words on the ladder, in the language being learnt, for the hub's tiles: loaded like
// any home data (useLoaded), and again whenever a word moves. Settings that can't be read (so no
// language) say so, rather than leaving the tiles loading.
import { useCallback, useEffect } from 'react'
import type { WordsSummary } from '../../../../shared/knowledge'
import { useSettingsState } from '../../components/useSettings'
import { useLoaded } from '../useLoaded'

export function useWordsSummary(): { summary?: WordsSummary; error?: string; reload: () => void } {
  const { settings, error: settingsError, reload: reloadSettings } = useSettingsState()
  const language = settings?.language
  const load = useCallback(
    (): Promise<WordsSummary> =>
      language
        ? window.duet.knowledge.summary(language)
        : new Promise<WordsSummary>(() => undefined),
    [language]
  )
  const { value: summary, error, reload } = useLoaded(load, 'Could not load your words.')
  useEffect(() => window.duet.knowledge.onChanged(reload), [reload])
  return settings ? { summary, error, reload } : { error: settingsError, reload: reloadSettings }
}
