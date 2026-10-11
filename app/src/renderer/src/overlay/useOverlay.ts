// The overlay's state, kept in step with the main process: settings, status, cards due, recent
// lines and the line that belongs on screen now.
import { useEffect, useMemo, useState } from 'react'
import type { DueCounts, OverlayLine, OverlaySettings, OverlayStatus } from '../../../shared/types'

export type OverlayState = {
  settings: OverlaySettings
  status: OverlayStatus
  /** Cards to review now (due plus new still allowed today). */
  due: number
  /** The line on screen, if any. */
  current?: OverlayLine
  /** Caption text on screen that is not yet a finished line (only when reading the screen). */
  building: string
}

const DEFAULTS: OverlaySettings = { language: 'es', level: 2, guessFirst: true, waitForTranslation: true, pauseForHelp: false, onboarded: false }

export function useOverlay(): OverlayState {
  const [settings, setSettings] = useState<OverlaySettings>(DEFAULTS)
  const [status, setStatus] = useState<OverlayStatus>({ trusted: false })
  const [due, setDue] = useState<DueCounts>({ due: 0, newAvailable: 0 })
  const [lines, setLines] = useState<OverlayLine[]>([])
  const [live, setLive] = useState('')
  const [currentId, setCurrentId] = useState<number | null>(null)

  useEffect(() => {
    window.duet.getState().then((state) => {
      setSettings(state.settings)
      setStatus(state.status)
      setDue(state.due)
    })
    const unsubscribe = [
      window.duet.onStatus(setStatus),
      window.duet.onSettings(setSettings),
      window.duet.onDue(setDue),
      window.duet.onLive(setLive),
      window.duet.onCurrent(setCurrentId),
      window.duet.onLine((line) =>
        setLines((current) => {
          const others = current.filter((item) => item.id !== line.id)
          return [...others, line].sort((a, b) => a.id - b.id).slice(-40)
        })
      )
    ]
    return () => unsubscribe.forEach((stop) => stop())
  }, [])

  const current = useMemo(() => lines.find((line) => line.id === currentId), [lines, currentId])
  const building = status.source !== 'transcript' && live && live !== current?.original ? live : ''
  return { settings, status, due: due.due + due.newAvailable, current, building }
}
