// The learner's settings, kept in step with the main process: undefined until they first arrive.
// useSettingsState also says why they couldn't be read, with a way to try again, for a page that
// would otherwise wait for them forever.
import { useCallback, useEffect, useState } from 'react'
import type { OverlaySettings } from '../../../shared/types'
import { say } from './errors'

export function useSettingsState(): { settings?: OverlaySettings; error?: string; reload: () => void } {
  const [settings, setSettings] = useState<OverlaySettings>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    window.duet.getState().then(
      (state) => {
        if (!current) return
        setSettings((now) => now ?? state.settings)
        setError(undefined)
      },
      (cause) => current && setError(say(cause, 'Could not read your settings.'))
    )
    const stop = window.duet.onSettings(setSettings)
    return () => {
      current = false
      stop()
    }
  }, [attempt])
  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  return { settings, error, reload }
}

export function useSettings(): OverlaySettings | undefined {
  return useSettingsState().settings
}
