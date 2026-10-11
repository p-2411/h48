// The learner's settings, kept in step with the main process: undefined until they first arrive.
import { useEffect, useState } from 'react'
import type { OverlaySettings } from '../../../shared/types'

export function useSettings(): OverlaySettings | undefined {
  const [settings, setSettings] = useState<OverlaySettings>()
  useEffect(() => {
    let current = true
    window.duet.getState().then(
      (state) => current && setSettings((now) => now ?? state.settings),
      () => undefined
    )
    const stop = window.duet.onSettings(setSettings)
    return () => {
      current = false
      stop()
    }
  }, [])
  return settings
}
