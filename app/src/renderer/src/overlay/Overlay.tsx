// The overlay: a strip the size of a subtitle at the bottom of the window, showing only the mixed
// line. Everything else appears when reached for: hovering the strip shows the actions above it;
// clicking it opens it up to the original and the English (and clicking again closes it; not while a
// checkpoint is offered or open: then a double-click opens the checkpoint); hovering a word shows its
// popup; ⚙ opens the settings; two fingers swiped sideways on the strip change the level. Words
// show on the strip itself only when the learner can act on them (see notice.ts). The strip sits on
// the video, no wider than it (the main process moves the window; see placement.ts), and can be
// dragged anywhere by its background. The mascot button left of it (or the talk keys) starts talking
// to Duet any time, about the line on screen if there is one (useStripTalk.ts). Right-clicking opens
// Duet's menu (Hide Duet, Settings…, Quit Duet).
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { SaveResult } from '../../../shared/cards'
import { AnimatePresence, motion } from 'motion/react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { DURATION, EASE_IN, EASE_OUT, fadeUp, GLIDE, pop, SPRING } from '../components/motion'
import { Icon } from '../components/Icon'
import { DuetMascot } from '../components/duet/DuetMascot'
import { say } from '../components/errors'
import { LevelSlider } from './LevelSlider'
import { useLevelStep } from './useLevelStep'
import { WheelSteps } from './wheel'
import { LineView } from './LineView'
import { actionable, quiet, statusDot } from './notice'
import type { CheckpointView, Offer } from '../../../shared/checkpoints'
import { Checkpoint } from './Checkpoint'
import { SettingsPopover } from './SettingsPopover'
import { TalkBubble, type TalkLook } from './TalkBubble'
import { useOverlay } from './useOverlay'
import { useSolid } from './useSolid'
import { useRoomAbove } from './useRoomAbove'
import { useStripTalk } from './useStripTalk'

const TOAST_MS = 5000
const TALK_LOOK_KEY = 'duet.talkLook'
// The checkpoint card's content fades this quickly (seconds), before it folds and after it opens.
const QUICK_FADE = 0.08

/** How a broken checkpoint or talk bubble says so, in its place above the strip. */
const popped = (message: React.ReactNode): React.ReactNode => <div className="strip-crash">{message}</div>

// Undo on a toast: takes back a star just given (`unsave`), or brings back the card a star just
// removed (`restore`; a removed card is kept for 30 s, longer than the toast shows). Open shows a
// card already saved, in My cards.
type Toast = { text: string; undo?: { kind: 'unsave' | 'restore'; cardId: string; key: string }; open?: string }

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
  const dock = useRef<HTMLDivElement>(null)
  useRoomAbove(dock)
  const { settings, status, current, building, translating, fit, loaded } = useOverlay()
  // Two fingers dragged right or left on the strip move the level one step (the level circle shows it).
  const level = useLevelStep(settings.level)
  const [stripSwipes] = useState(() => new WheelSteps({ sideways: true }))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Clicked open: the strip shows more of the line, and its actions stay up (in React, so its size
  // change glides). Another click, or Escape, closes it.
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<Toast>()
  const talk = useStripTalk(settings.language, useCallback((text: string) => setToast({ text }), []))
  // Duet and its subtitles while talking: dark, or light over a bright picture (the learner's pick,
  // remembered in this window; Duet can't see what's behind it, and guessing would cost a screen grab).
  const [talkLook, setTalkLook] = useState<TalkLook>(() => {
    try {
      return localStorage.getItem(TALK_LOOK_KEY) === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const chooseTalkLook = useCallback((look: TalkLook) => {
    setTalkLook(look)
    try {
      localStorage.setItem(TALK_LOOK_KEY, look)
    } catch {
      // Not remembered; it still applies now.
    }
  }, [])
  // Stars given in this run, by line and word ("12:3", or "12:line"), so they show as saved.
  const [stars, setStars] = useState<Record<string, string>>({})
  // A checkpoint offered (the strip glows; a double-click on it opens it) and the one open.
  const [offer, setOffer] = useState<Offer | null>(null)
  const [checkpoint, setCheckpoint] = useState<CheckpointView>()
  // The checkpoint's card is still folding back into the strip (the strip's top corners stay square
  // until it has gone, so the glow never shows between them).
  const [folding, setFolding] = useState(false)
  useEffect(() => window.duet.checkpoint.onOffer(setOffer), [])
  useEffect(() => window.duet.checkpoint.onClosed(() => setCheckpoint(undefined)), [])
  // Where the pointer went down on the strip, so a click can be told from a drag.
  const pressedAt = useRef<{ x: number; y: number }>(undefined)
  // A checkpoint opening: a second ask (the pointer coming back, a click) waits for the first.
  const opening = useRef(false)
  const askCheckpoint = (): void => {
    if (!offer || checkpoint || opening.current) return
    opening.current = true
    window.duet.checkpoint
      .open()
      .then(setCheckpoint, (cause) => setToast({ text: say(cause, 'That checkpoint has gone.') }))
      .finally(() => (opening.current = false))
  }
  /** A press on the strip's own background (not a word, a button or the card), without dragging it. */
  const onBackground = (event: React.MouseEvent<HTMLElement>): boolean => {
    const pressed = pressedAt.current
    const moved = pressed ? Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4 : true
    return !moved && !(event.target as Element).closest(NOT_FOR_DRAGGING)
  }
  // A click on the strip opens it up to the whole line and its English (and the actions row), and
  // closes it again; pointing at it shows nothing more. While a checkpoint is offered the strip is
  // for that instead: a double-click opens the question, so a stray click on a glowing strip doesn't.
  const clickStrip = (event: React.MouseEvent<HTMLElement>): void => {
    if (offer || checkpoint || !onBackground(event)) return
    setOpen((now) => !now)
  }
  const doubleClickStrip = (event: React.MouseEvent<HTMLElement>): void => {
    if (onBackground(event)) askCheckpoint()
  }

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
        text: 'Removed from Your words',
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
        : { text: `Already saved “${card.expression}”`, open: card.id }
    )
  }

  // The word's colour changing is the answer; one that couldn't change says so.
  const ignore = (wordKey: string, ignored: boolean): void => {
    window.duet.knowledge
      .setIgnored(settings.language, wordKey, ignored)
      .catch((error) => setToast({ text: say(error, ignored ? 'Could not leave that word out. Try again.' : 'Could not bring that word back. Try again.') }))
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

  // The whole line and its English show while the strip is clicked open or its settings are (never
  // over a checkpoint: then the strip is for that).
  const showMore = (open || settingsOpen) && !offer && !checkpoint
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
      <div
        ref={dock}
        className={`dock${settingsOpen || showMore ? ' pinned' : ''}${offer || checkpoint ? ' asking' : ''}`}
        data-solid
        onContextMenu={(event) => {
          event.preventDefault()
          window.duet.showMenu()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          if (settingsOpen) setSettingsOpen(false)
          else setOpen(false)
        }}
      >
        <AnimatePresence>{settingsOpen && <SettingsPopover key="settings" settings={settings} />}</AnimatePresence>
        <div className="actions" role="toolbar" aria-label="Line actions">
          <LevelSlider settings={settings} steps={level} />
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
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Icon name="settings" />
          </button>
        </div>

        {/* It opens out of the strip and goes back into it, in its own boundary: one that breaks
            says so above the strip, which goes on. */}
        <AnimatePresence>
          {talk.talking && talk.about && (
            <motion.div key="talk" className={`talk-bubble ${talkLook}`} data-solid role="dialog" aria-label="Talking with Duet" style={{ x: '-50%' }} {...pop()}>
              <ErrorBoundary what="Talking with Duet" frame={popped}>
                <TalkBubble live={talk.live} language={talk.about.language} look={talkLook} onLook={chooseTalkLook} onText={talk.toText} />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="strip-row">
        <button
          type="button"
          className={`talk-button${talk.talking ? ' on' : ''}`}
          title={talk.talking ? 'Bring Duet back (end talking)' : 'Talk to Duet'}
          aria-label={talk.talking ? 'Bring Duet back and end talking' : 'Talk to Duet'}
          aria-pressed={talk.talking}
          data-solid
          onClick={talk.talking ? talk.end : talk.begin}
        >
          {/* Duet's seat. At rest, its own face, dozing: it peeks when the pointer comes near and stays
              a moment (the engine's own sleep). Pressed, Duet leaves it, up into the bubble (only one
              Duet on screen), and a back arrow slides in: pressing it brings Duet back down, to doze. */}
          <AnimatePresence mode="popLayout" initial={false}>
            {talk.talking ? (
              <motion.span
                key="back"
                className="talk-face talk-back"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE_OUT, delay: 0.08 } }}
                exit={{ opacity: 0, x: -8, transition: { duration: 0.16, ease: EASE_IN } }}
              >
                <Icon name="back" size={18} />
              </motion.span>
            ) : (
              <motion.span
                key="face"
                className="talk-face"
                initial={{ opacity: 0, y: -12, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.05, 0.9, 0.1, 1.05], delay: 0.1 } }}
                exit={{ opacity: 0, y: -14, scale: 0.7, transition: { duration: 0.2, ease: EASE_IN } }}
              >
                <DuetMascot state="asleep" width={28} finish="flat" theme="dark" watch="near" label="Duet, asleep" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        {/* An open checkpoint grows up out of the strip, the two one shape (the light below in both),
            and folds back into it when done; one that breaks says so above the strip. */}
        <AnimatePresence onExitComplete={() => setFolding(false)}>
          {checkpoint && (
            <motion.div
              key="checkpoint"
              className="checkpoint"
              data-solid
              role="dialog"
              aria-label="Checkpoint"
              // The card stays solid while it grows and folds (were it see-through, the glow behind
              // would show through it); its content fades in once it opens, and out first as it folds.
              initial={{ height: 0 }}
              animate={{ height: 'auto', transition: SPRING }}
              exit={{ height: 0, transition: { duration: DURATION.base, ease: EASE_IN, delay: QUICK_FADE } }}
              onAnimationStart={() => setFolding(true)}
            >
              <motion.div
                className="checkpoint-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: DURATION.fast, delay: QUICK_FADE } }}
                exit={{ opacity: 0, transition: { duration: QUICK_FADE } }}
              >
                <ErrorBoundary what="The checkpoint" frame={popped}>
                  <Checkpoint view={checkpoint} onClose={() => setCheckpoint(undefined)} onError={(text) => setToast({ text })} />
                </ErrorBoundary>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          // Its size glides to each line's (the corners are given here so they stay round while it
          // does); under an open checkpoint, until its card has folded away, its top corners meet the
          // card's.
          layout
          transition={GLIDE}
          style={{
            borderTopLeftRadius: checkpoint || folding ? 0 : 18,
            borderTopRightRadius: checkpoint || folding ? 0 : 18,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 18
          }}
          className={`strip${offer || checkpoint ? ' glow' : ''}`}
          title={offer && !checkpoint ? 'A quick checkpoint: double-click the strip' : undefined}
          onPointerDown={(event) => {
            pressedAt.current = { x: event.clientX, y: event.clientY }
            startDrag(event)
          }}
          onClick={clickStrip}
          onDoubleClick={doubleClickStrip}
          onWheel={(event) => level.step(stripSwipes.step(event.deltaY, event.deltaX, event.timeStamp))}
        >
          {/* Light from below, inside the glass, while a checkpoint is offered, and on while it's
              being done (overlay.css). */}
          <AnimatePresence>
            {(offer || checkpoint) && (
              <motion.span
                key="glow"
                className="sea-glow"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.6, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.5, ease: EASE_IN } }}
              />
            )}
          </AnimatePresence>
          <i
            className={`dot ${dot.tone}`}
            title={dot.text}
            role="img"
            aria-label={`Status: ${dot.text}`}
          />

          {/* Each new line rises in as the last fades out. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={current ? current.id : 'idle'} layout {...fadeUp(4, 0.18)}>
              {current ? (
                <LineView
                  line={current}
                  settings={settings}
                  starred={(pair) => !!stars[key(pair)]}
                  onStar={star}
                  onIgnore={ignore}
                  expanded={showMore}
                />
              ) : (
                <p className="idle">
                  {status.url ? 'Lines appear here as they are spoken' : state.text}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
          {building && <p className="hint">{building}</p>}

          <AnimatePresence initial={false}>
          {notice && (
            <motion.p key={`notice:${notice.text}`} layout {...fadeUp()} className="notice" role="status">
              <span>{notice.text}</span>
              {notice.action && (
                <button type="button" className="act primary" onClick={notice.action.run}>
                  {notice.action.label}
                </button>
              )}
            </motion.p>
          )}
          {toast && (
            <motion.p key={`toast:${toast.text}`} layout {...fadeUp()} className="toast" role="status">
              <span>{toast.text}</span>
              {toast.undo && (
                <button type="button" className="act" onClick={() => undo(toast.undo!)}>
                  Undo
                </button>
              )}
              {toast.open && (
                <button
                  type="button"
                  className="act"
                  onClick={() => {
                    void window.duet.cards.open(toast.open)
                    setToast(undefined)
                  }}
                >
                  Open
                </button>
              )}
            </motion.p>
          )}
          </AnimatePresence>
        </motion.div>
        </div>
      </div>
    </div>
  )
}
