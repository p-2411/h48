// The overlay's state, kept in step with the main process: settings, status, recent lines and the
// line to show. A line still being translated never replaces one that is ready: the
// strip keeps the last translated line (through gaps between lines too) until the next is ready.
import { useEffect, useMemo, useState } from 'react'
import {
  type OverlayLine,
  type OverlaySettings,
  type OverlayStatus,
  DEFAULT_SETTINGS
} from '../../../shared/types'

export type OverlayState = {
  settings: OverlaySettings
  status: OverlayStatus
  /** The line to show: the one on screen once it is translated, until then the last one that was. */
  current?: OverlayLine
  /** Caption text on screen that is not yet a finished line (only when reading the screen, and
   * only while there is no line to show). */
  building: string
  /** The line on screen is still being translated (the strip shows the one before meanwhile). */
  translating: boolean
  /** How wide the strip may be to stay inside the video; null when it can be as wide as it likes. */
  fit: number | null
  /** The first state has arrived from the main process. Until then the defaults stand in, and the
   * strip says nothing about them (no false "needs permission" flash). */
  loaded: boolean
}

/** The line the strip last showed, and the video and language it belongs to. */
export type Shown = { id: number; url?: string; language: string }

/**
 * The line to show: the one on screen once it is settled (translated, or failed and shown as it
 * is); while it is still being translated, the line shown before, if it belongs to the same video
 * and language (switching either drops it). `next` is what to remember as shown.
 */
// How long to wait before asking for the first state again, when asking failed.
const STATE_RETRY_MS = 2_000

export function chooseLine(
  onScreen: OverlayLine | undefined,
  lines: OverlayLine[],
  shown: Shown | undefined,
  here: { url?: string; language: string }
): { current?: OverlayLine; next?: Shown } {
  const same = (item?: Shown): boolean =>
    !!item && item.url === here.url && item.language === here.language
  if (onScreen && onScreen.state !== 'pending') {
    const next = shown?.id === onScreen.id && same(shown) ? shown : { id: onScreen.id, ...here }
    return { current: onScreen, next }
  }
  const kept = same(shown) ? lines.find((line) => line.id === shown!.id) : undefined
  return { current: kept ?? onScreen, next: shown }
}

export function useOverlay(): OverlayState {
  const [settings, setSettings] = useState<OverlaySettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<OverlayStatus>({ trusted: false })
  const [lines, setLines] = useState<OverlayLine[]>([])
  const [live, setLive] = useState('')
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [fit, setFit] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // The first state, asked for again until it comes: until then the strip stays quiet, rather than
    // show notices made from its defaults (such as a permission it may well have). A status update
    // that arrives first does as well.
    let retry: number | undefined
    const ask = (): void => {
      window.duet.getState().then(
        (state) => {
          setSettings(state.settings)
          setStatus(state.status)
          setFit(state.fit)
          setLoaded(true)
        },
        (error) => {
          console.error('[duet] could not read the overlay state', error)
          retry = window.setTimeout(ask, STATE_RETRY_MS)
        }
      )
    }
    ask()
    const unsubscribe = [
      window.duet.onFit(setFit),
      window.duet.onStatus((next) => {
        setStatus(next)
        setLoaded(true)
      }),
      window.duet.onSettings(setSettings),
      window.duet.onLive(setLive),
      window.duet.onCurrent(setCurrentId),
      window.duet.onLine((line) =>
        setLines((current) => {
          const others = current.filter((item) => item.id !== line.id)
          return [...others, line].sort((a, b) => a.id - b.id).slice(-40)
        })
      )
    ]
    return () => {
      window.clearTimeout(retry)
      unsubscribe.forEach((stop) => stop())
    }
  }, [])

  const onScreen = useMemo(() => lines.find((line) => line.id === currentId), [lines, currentId])
  const [shown, setShown] = useState<Shown>()
  const { current, next } = chooseLine(onScreen, lines, shown, {
    url: status.url,
    language: settings.language
  })
  if (next !== shown) setShown(next)
  const building = !current && status.source !== 'transcript' ? live : ''
  return {
    settings,
    status,
    current,
    building,
    translating: onScreen?.state === 'pending',
    fit,
    loaded
  }
}
