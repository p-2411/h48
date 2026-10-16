// How cards work: a short tour of the page itself, on sample cards (sample.ts), ending on every kind of
// card. The page shows the sample while it runs and the learner's own cards again after it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { KIND_NAMES, STEP_LABELS, type CardKind, type Step } from '../../../../shared/flashcards'
import { DuetMascot } from '../../components/duet/DuetMascot'
import { icons } from './bits'
import { TOUR } from './tour'

const reveal = <span className="k-reveal">Show the answer</span>
const mic = (
  <span className="k-mic">
    <span className="k-mic-btn">{icons.mic}</span>
    <small>or type it</small>
  </span>
)

// Each kind of card as it really looks, only smaller: its step, its prompt, what you do.
const KINDS: { kind: CardKind; step: Step; text: string; face: React.ReactNode }[] = [
  {
    kind: 'sentence',
    step: 'heard',
    text: 'A word from your video, in its line. What does it mean here?',
    face: (
      <>
        <span className="k-clip">
          <span>
            Mañana tengo que <b>madrugar</b>.
          </span>
        </span>
        <span className="k-word mark" data-step="heard">
          madrugar
        </span>
        {reveal}
      </>
    )
  },
  {
    kind: 'word',
    step: 'heard',
    text: 'Just the word and its sound, when Duet has no line for it yet.',
    face: (
      <>
        <span className="k-word mark" data-step="heard" style={{ marginTop: 14 }}>
          aprovechar
        </span>
        <span className="k-meta">
          /a.pɾo.βeˈtʃaɾ/ <span className="k-sound">{icons.sound}</span>
        </span>
        {reveal}
      </>
    )
  },
  {
    kind: 'listening',
    step: 'heard',
    text: 'Hear the line with the words hidden. Double-click to hear it slower.',
    face: (
      <>
        <span className="k-play">{icons.play(12)}</span>
        <span className="k-line">What did she say?</span>
        <small className="k-hint">Double-click to hear it slower</small>
      </>
    )
  },
  {
    kind: 'picture',
    step: 'heard',
    text: 'A picture, and “What’s this called?” Only when the card has a picture.',
    face: (
      <>
        <span className="k-pic">{icons.pan}</span>
        <span className="k-line">What’s this called?</span>
        {reveal}
      </>
    )
  },
  {
    kind: 'gap',
    step: 'known',
    text: 'The line with the word missing. Say it out loud, or type it.',
    face: (
      <>
        <span className="k-line" style={{ marginTop: 10 }}>
          Calienta el aceite en la <span className="k-gap" />.
        </span>
        <small className="k-hint">Heat the oil in the frying pan.</small>
        {mic}
      </>
    )
  },
  {
    kind: 'use',
    step: 'say',
    text: 'A small situation. Use the word in a sentence of your own.',
    face: (
      <>
        <span className="k-line" style={{ marginTop: 10 }}>
          A friend asks you out tonight. Say no, and why.
        </span>
        <small className="k-hint">
          Use <b>madrugar</b>
        </small>
        {mic}
      </>
    )
  },
  {
    kind: 'fresh',
    step: 'use',
    text: 'A word you already use. Now and then, a quick “Still know it?”',
    face: (
      <>
        <span className="k-word mark" data-step="use" style={{ marginTop: 14 }}>
          vale
        </span>
        <small className="k-hint">Still know it?</small>
        {reveal}
      </>
    )
  }
]

type Place = {
  ring: { left: number; top: number; width: number; height: number }
  callout: { left: number; top: number }
}

const CALLOUT_W = 340
const GAP = 14

/** Where the stop's target is on the page, and where its callout goes: beside it when there's room,
 * else below or above it, else in its lower corner. Kept up to date as the page moves. */
function usePlace(
  root: React.RefObject<HTMLDivElement | null>,
  callout: React.RefObject<HTMLDivElement | null>,
  target?: string
): Place | undefined {
  const [found, setFound] = useState<{ target: string; place?: Place }>()
  useLayoutEffect(() => {
    const page = root.current?.parentElement
    if (!target || !page) return
    let frame = 0
    const measure = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const element = page.querySelector<HTMLElement>(`[data-tour="${target}"]`)
        const box = page.getBoundingClientRect()
        if (!element) return setFound({ target })
        const r = element.getBoundingClientRect()
        const ring = {
          left: r.left - box.left - 6,
          top: r.top - box.top - 6,
          width: r.width + 12,
          height: r.height + 12
        }
        const h = callout.current?.offsetHeight ?? 200
        const w = Math.min(CALLOUT_W, box.width - 2 * GAP)
        const clampX = (x: number): number => Math.max(GAP, Math.min(box.width - w - GAP, x))
        const clampY = (y: number): number => Math.max(GAP, Math.min(box.height - h - GAP, y))
        const right = box.width - (ring.left + ring.width)
        let spot: Place['callout']
        if (right >= w + 2 * GAP)
          spot = { left: ring.left + ring.width + GAP, top: clampY(ring.top) }
        else if (ring.left >= w + 2 * GAP)
          spot = { left: ring.left - w - GAP, top: clampY(ring.top) }
        else if (box.height - (ring.top + ring.height) >= h + 2 * GAP)
          spot = { left: clampX(ring.left), top: ring.top + ring.height + GAP }
        else if (ring.top >= h + 2 * GAP)
          spot = { left: clampX(ring.left), top: ring.top - h - GAP }
        else
          spot = {
            left: clampX(ring.left + ring.width - w - GAP),
            top: clampY(ring.top + ring.height - h - GAP)
          }
        setFound({ target, place: { ring, callout: spot } })
      })
    }
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(page)
    const changed = new MutationObserver(measure)
    changed.observe(page, { childList: true, subtree: true })
    // Cards deal and flip with animations that move without changing the page's elements.
    const settle = setInterval(measure, 400)
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      changed.disconnect()
      clearInterval(settle)
    }
  }, [root, callout, target])
  return found && found.target === target ? found.place : undefined
}

/** How cards work: a walk through the page itself, on sample cards. It opens by itself the first
 * time Review is opened, and again from the ? in the bar. Back, Next and Skip move through it; ← and
 * → too (except on the card, where the review has the keys), and Esc ends it. */
export function Guide({
  at,
  onAt,
  onClose,
  onFinish
}: {
  at: number
  onAt: (stop: number) => void
  onClose: () => void
  onFinish: () => void
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const callout = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const stop = TOUR[at]
  const last = at === TOUR.length - 1
  const place = usePlace(root, callout, stop.target)
  useEffect(() => {
    if (stop.mode !== 'session') next.current?.focus()
  }, [at, stop.mode])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      else if (stop.mode === 'session') return
      else if (event.key === 'ArrowRight' && !last) onAt(at + 1)
      else if (event.key === 'ArrowLeft' && at > 0) onAt(at - 1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [at, last, stop.mode, onAt, onClose])
  const dark = document.documentElement.classList.contains('theme-dark')
  const foot = (
    <div className="fc-g-foot">
      <span className="fc-g-dots" aria-label={`Step ${at + 1} of ${TOUR.length}`}>
        {TOUR.map((_, index) => (
          <i key={index} className={index === at ? 'on' : ''} />
        ))}
      </span>
      <span className="grow" />
      {at > 0 && (
        <button type="button" className="quiet" onClick={() => onAt(at - 1)}>
          Back
        </button>
      )}
      <button
        ref={next}
        type="button"
        className="start"
        onClick={() => (last ? onFinish() : onAt(at + 1))}
      >
        {last ? 'Go to Review' : 'Next'}
      </button>
    </div>
  )

  // The last stop: every kind of card, as a reference, over the page.
  if (!stop.target)
    return (
      <div className="fc-guide" ref={root}>
        <div
          className="fc-guide-panel is-wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fc-guide-title"
        >
          <div className="fc-guide-top">
            <DuetMascot
              state="proud"
              width={56}
              theme={dark ? 'dark' : 'light'}
              watch="near"
              label="Duet"
            />
          </div>
          <div className="fc-guide-body" key={at}>
            <h2 id="fc-guide-title">{stop.title}</h2>
            <p className="text">{stop.text}</p>
            <div className="fc-kinds">
              {KINDS.map((kind) => (
                <div className="fc-kind" key={kind.kind}>
                  <div className="fc-kind-face" aria-hidden="true">
                    <span className="k-step" data-step={kind.step}>
                      <span className="dot" />
                      {STEP_LABELS[kind.step]}
                    </span>
                    {kind.face}
                  </div>
                  <b data-step={kind.step}>
                    <span className="dot" />
                    {KIND_NAMES[kind.kind]}
                  </b>
                  <p>{kind.text}</p>
                </div>
              ))}
            </div>
            {foot}
          </div>
        </div>
      </div>
    )

  return (
    <div className="fc-tour" ref={root}>
      {place && <span className="fc-tour-ring" aria-hidden="true" style={place.ring} />}
      <div
        ref={callout}
        className="fc-tour-callout"
        role="dialog"
        aria-labelledby="fc-guide-title"
        style={
          place ? { left: place.callout.left, top: place.callout.top } : { right: 16, bottom: 16 }
        }
      >
        <div className="fc-guide-top">
          <DuetMascot
            state="idle"
            width={40}
            theme={dark ? 'dark' : 'light'}
            watch="near"
            label="Duet"
          />
          <span className="grow" />
          <button type="button" className="quiet" onClick={onClose}>
            Skip tour
          </button>
        </div>
        <div className="fc-guide-body" key={at}>
          <h2 id="fc-guide-title">{stop.title}</h2>
          <p className="text">{stop.text}</p>
          {stop.keys && (
            <div className="fc-g-keys">
              <div>
                <kbd>Space</kbd>Show the answer, then Got it
              </div>
              <div>
                <kbd>1</kbd>Forgot
              </div>
              <div>
                <kbd>←</kbd>Back to the last card
              </div>
            </div>
          )}
          {foot}
        </div>
      </div>
    </div>
  )
}
