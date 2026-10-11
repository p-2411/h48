// The overlay: a strip the size of a subtitle at the bottom of the window, showing only the mixed
// line. Everything else appears when reached for: hovering the strip shows the original, the
// English and the actions above it; hovering a word shows its popup; ⚙ opens the settings. Words
// show on the strip itself only when the learner can act on them (see notice.ts). The strip sits on
// the video, no wider than it (the main process moves the window; see placement.ts), and can be
// dragged anywhere by its background.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { SaveResult } from '../../../shared/cards'
import { Icon } from '../components/Icon'
import { say } from '../components/errors'
import { LevelMeter } from './LevelMeter'
import { LineView } from './LineView'
import { actionable, quiet, statusDot } from './notice'
import { SettingsPopover } from './SettingsPopover'
import { useOverlay } from './useOverlay'
import { useSolid } from './useSolid'

const TOAST_MS = 5000

// Undo on a toast: takes back a star just given (`unsave`), or brings back the card a star just
// removed (`restore`; a removed card is kept for 30 s, longer than the toast shows).
type Toast = { text: string; undo?: { kind: 'unsave' | 'restore'; cardId: string; key: string } }

// Pressing these does what they do; pressing anywhere else on the strip drags it.
const NOT_FOR_DRAGGING = 'button, a, .w.live, .english, .popup'

/** Drags the whole overlay window while the pointer is held on the strip's background. */
function startDrag(event: PointerEvent<HTMLElement>): void {
  if (event.button !== 0 || (event.target as Element).closest(NOT_FOR_DRAGGING)) return
  const strip = event.currentTarget
  strip.setPointerCapture(event.pointerId)
  strip.classList.add('dragging')
  window.duet.drag('start')
  const end = (): void => {
    strip.classList.remove('dragging')
    window.duet.drag('end')
    strip.removeEventListener('lostpointercapture', end)
  }
  strip.addEventListener('lostpointercapture', end)
}

export function Overlay(): React.JSX.Element {
  useSolid()
  const { settings, status, current, building, translating, fit, loaded } = useOverlay()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<Toast>()
  // Stars given in this run, by line and word ("12:3", or "12:line"), so they show as saved.
  const [stars, setStars] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const key = (pair?: number): string => `${current?.id}:${pair ?? 'line'}`
  // A star in progress: a second press waits for the first to finish.
  const starring = useRef(false)
  const star = async (pair?: number): Promise<void> => {
    if (!current || starring.current) return
    const existing = stars[key(pair)]
    if (existing) {
      window.duet.unsave(existing)
      setStars((now) =>
        Object.fromEntries(Object.entries(now).filter(([name]) => name !== key(pair)))
      )
      setToast({
        text: 'Removed from My cards',
        undo: { kind: 'restore', cardId: existing, key: key(pair) }
      })
      return
    }
    starring.current = true
    let result: SaveResult | undefined
    try {
      result = await window.duet.save(current.id, pair)
    } catch (error) {
      setToast({ text: say(error, 'Could not save that. Try again.') })
      return
    } finally {
      starring.current = false
    }
    if (!result) return
    const card = 'saved' in result ? result.saved : result.duplicate
    setStars((now) => ({ ...now, [key(pair)]: card.id }))
    setToast(
      'saved' in result
        ? {
            text: `Saved “${card.expression}”`,
            undo: { kind: 'unsave', cardId: card.id, key: key(pair) }
          }
        : { text: `Already saved “${card.expression}”` }
    )
  }

  const undo = ({ kind, cardId, key: starKey }: NonNullable<Toast['undo']>): void => {
    setToast(undefined)
    if (kind === 'unsave') {
      window.duet.unsave(cardId)
      setStars((now) =>
        Object.fromEntries(Object.entries(now).filter(([name]) => name !== starKey))
      )
      return
    }
    window.duet.cards
      .restore(cardId)
      .then(() => setStars((now) => ({ ...now, [starKey]: cardId })))
      .catch((error) => setToast({ text: say(error, 'Could not bring that card back.') }))
  }

  const notice = loaded ? actionable(status, settings.language) : undefined
  const state = quiet(status, settings.language)
  const ready = current?.state === 'ready'
  // Before the first state arrives the dot stays grey, like the notices stay quiet.
  const dot = loaded
    ? statusDot(status, settings.language, {
        translating,
        failed: current?.state === 'failed',
        building: !!building
      })
    : { tone: 'off', text: state.text }

  return (
    <div
      className="stage"
      style={fit ? ({ '--fit': `${fit}px` } as React.CSSProperties) : undefined}
    >
      <div className={`dock${settingsOpen ? ' pinned' : ''}`} data-solid>
        {settingsOpen && <SettingsPopover settings={settings} />}
        <div className="actions" role="toolbar" aria-label="Line actions">
          <LevelMeter settings={settings} />
          <span className="spacer" />
          <button
            type="button"
            className="act primary"
            disabled={!current}
            onClick={() => window.duet.explainLine(current?.id)}
          >
            Explain
          </button>
          <button
            type="button"
            className={`act icon${stars[key()] ? ' on' : ''}`}
            disabled={!ready}
            title={stars[key()] ? 'Saved — click to remove' : 'Save this line'}
            aria-label={stars[key()] ? 'Remove the saved line' : 'Save this line'}
            onClick={() => star()}
          >
            <Icon name="star" filled={!!stars[key()]} />
          </button>
          <button
            type="button"
            className="act icon"
            disabled={!current}
            title="Replay this line"
            aria-label="Replay this line"
            onClick={() => window.duet.replay(current?.id)}
          >
            <Icon name="replay" />
          </button>
          <button
            type="button"
            className={`act icon${settingsOpen ? ' on' : ''}`}
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Icon name="settings" />
          </button>
        </div>

        <div className="strip" onPointerDown={startDrag}>
          <i
            className={`dot ${dot.tone}`}
            title={dot.text}
            role="img"
            aria-label={`Status: ${dot.text}`}
          />

          {current ? (
            <LineView
              line={current}
              settings={settings}
              starred={(pair) => !!stars[key(pair)]}
              onStar={star}
            />
          ) : (
            <p className="idle">
              {status.url ? 'Lines appear here as they are spoken' : state.text}
            </p>
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
          {toast && (
            <p className="toast">
              <span>{toast.text}</span>
              {toast.undo && (
                <button type="button" className="act" onClick={() => undo(toast.undo!)}>
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
