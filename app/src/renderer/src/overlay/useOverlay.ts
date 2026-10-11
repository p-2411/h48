// The overlay's state, kept in step with the main process: settings, status, cards due, recent
// lines and the line to show. A line still being translated never replaces one that is ready: the
// strip keeps the last translated line (through gaps between lines too) until the next is ready.
import { useEffect, useMemo, useState } from 'react'
import type { DueCounts, OverlayLine, OverlaySettings, OverlayStatus } from '../../../shared/types'

export type OverlayState = {
  settings: OverlaySettings
  status: OverlayStatus
  /** Cards to review now (due plus new still allowed today). */
  due: number
  /** The line to show: the one on screen once it is translated, until then the last one that was. */
  current?: OverlayLine
  /** Caption text on screen that is not yet a finished line (only when reading the screen, and
   * only while there is no line to show). */
  building: string
}

const DEFAULTS: OverlaySettings = { language: 'es', level: 2, guessFirst: true, waitForTranslation: true, pauseForHelp: false, onboarded: false, shortcut: 'Alt+Shift+D' }

/** The line the strip last showed, and the video and language it belongs to. */
export type Shown = { id: number; url?: string; language: string }

/**
 * The line to show: the one on screen once it is settled (translated, or failed and shown as it
 * is); while it is still being translated, the line shown before, if it belongs to the same video
 * and language (switching either drops it). `next` is what to remember as shown.
 */
export function chooseLine(
  onScreen: OverlayLine | undefined,
  lines: OverlayLine[],
  shown: Shown | undefined,
  here: { url?: string; language: string }
): { current?: OverlayLine; next?: Shown } {
  const same = (item?: Shown): boolean => !!item && item.url === here.url && item.language === here.language
  if (onScreen && onScreen.state !== 'pending') {
    const next = shown?.id === onScreen.id && same(shown) ? shown : { id: onScreen.id, ...here }
    return { current: onScreen, next }
  }
  const kept = same(shown) ? lines.find((line) => line.id === shown!.id) : undefined
  return { current: kept ?? onScreen, next: shown }
}

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

  const onScreen = useMemo(() => lines.find((line) => line.id === currentId), [lines, currentId])
  const [shown, setShown] = useState<Shown>()
  const { current, next } = chooseLine(onScreen, lines, shown, { url: status.url, language: settings.language })
  if (next !== shown) setShown(next)
  const building = !current && status.source !== 'transcript' ? live : ''
  return { settings, status, due: due.due + due.newAvailable, current, building }
}
