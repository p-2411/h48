// The overlay: a strip the size of a subtitle at the bottom of the window, showing only the mixed
// line. Everything else appears when reached for: hovering the strip shows the original, the
// English and the actions above it; hovering a word shows its popup; ⚙ opens the settings. Words
// show on the strip itself only when the learner can act on them (see notice.ts).
import { useEffect, useState } from 'react'
import type { SaveResult } from '../../../shared/cards'
import { LineView } from './LineView'
import { actionable, quiet } from './notice'
import { SettingsPopover } from './SettingsPopover'
import { useOverlay } from './useOverlay'
import { useSolid } from './useSolid'

const TOAST_MS = 5000
// Paused this long with cards due, the strip suggests a review.
const NUDGE_AFTER_MS = 15_000

type Toast = { text: string; cardId?: string }

export function Overlay(): React.JSX.Element {
  useSolid()
  const { settings, status, due, current, building } = useOverlay()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<Toast>()
  // Stars given in this run, by line and word ("12:3", or "12:line"), so they show as saved.
  const [stars, setStars] = useState<Record<string, string>>({})
  const [pausedLong, setPausedLong] = useState(false)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  // The review nudge: the video has stayed paused for a while.
  useEffect(() => {
    if (status.playing || !status.url) return
    const timer = setTimeout(() => setPausedLong(true), NUDGE_AFTER_MS)
    return () => {
      clearTimeout(timer)
      setPausedLong(false)
    }
  }, [status.playing, status.url])

  const key = (pair?: number): string => `${current?.id}:${pair ?? 'line'}`
  const star = async (pair?: number): Promise<void> => {
    if (!current) return
    const existing = stars[key(pair)]
    if (existing) {
      window.duet.unsave(existing)
      setStars((now) => Object.fromEntries(Object.entries(now).filter(([name]) => name !== key(pair))))
      setToast({ text: 'Star removed' })
      return
    }
    const result: SaveResult | undefined = await window.duet.save(current.id, pair)
    if (!result) return
    const card = 'saved' in result ? result.saved : result.duplicate
    setStars((now) => ({ ...now, [key(pair)]: card.id }))
    setToast('saved' in result ? { text: `★ Saved “${card.expression}”`, cardId: card.id } : { text: `Already saved “${card.expression}”` })
  }

  const notice = actionable(status, settings.language)
  const state = quiet(status, settings.language)
  const ready = current?.state === 'ready'
  const nudge = pausedLong && due > 0 && !notice

  return (
    <div className="stage">
      <div className={`dock${settingsOpen ? ' pinned' : ''}`} data-solid>
        {settingsOpen && <SettingsPopover settings={settings} line={current} />}
        <div className="actions" role="toolbar" aria-label="Line actions">
          <span className="grip" title="Drag to move" aria-hidden="true">
            ⋮⋮
          </span>
          <button type="button" className="act primary" disabled={!current} onClick={() => window.duet.explainLine()}>
            Explain
          </button>
          <button type="button" className={`act${stars[key()] ? ' on' : ''}`} disabled={!ready} onClick={() => star()}>
            {stars[key()] ? '★ Saved' : '☆ Save line'}
          </button>
          <button type="button" className="act" disabled={!current} onClick={() => window.duet.replay()}>
            ↺ Replay
          </button>
          <button type="button" className="act" onClick={() => window.duet.showScript()}>
            Script
          </button>
          <button type="button" className={`act${settingsOpen ? ' on' : ''}`} aria-label="Settings" onClick={() => setSettingsOpen(!settingsOpen)}>
            ⚙
          </button>
          <button type="button" className="act" aria-label="Hide Duet" onClick={() => window.duet.hide()}>
            ×
          </button>
        </div>

        <div className="strip">
          <div className="corner">
            {due > 0 && (
              <button type="button" className="due" onClick={() => window.duet.openReview()} title="Review the cards due">
                {due} due
              </button>
            )}
            <i className={`dot${state.on ? ' on' : ''}`} title={state.text} />
          </div>

          {current ? (
            <LineView line={current} settings={settings} starred={(pair) => !!stars[key(pair)]} onStar={star} />
          ) : (
            <p className="idle">{status.url ? 'Lines appear here as they are spoken' : state.text}</p>
          )}
          {building && <p className="hint">{building}</p>}

          {notice && (
            <p className="notice">
              <span>{notice.text}</span>
              {notice.action && (
                <button type="button" className="act primary" onClick={notice.action.run}>
                  {notice.action.label}
                </button>
              )}
            </p>
          )}
          {nudge && (
            <p className="notice">
              <span>
                Review {due} {due === 1 ? 'card' : 'cards'} · about {Math.max(1, Math.round(due * 0.4))} min
              </span>
              <button type="button" className="act primary" onClick={() => window.duet.openReview()}>
                Review
              </button>
            </p>
          )}
          {toast && (
            <p className="toast">
              <span>{toast.text}</span>
              {toast.cardId && (
                <button
                  type="button"
                  className="act"
                  onClick={() => {
                    window.duet.unsave(toast.cardId!)
                    setStars((now) => Object.fromEntries(Object.entries(now).filter(([, id]) => id !== toast.cardId)))
                    setToast(undefined)
                  }}
                >
                  Undo
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
