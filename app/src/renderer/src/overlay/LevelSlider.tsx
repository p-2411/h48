// How much of the language the line swaps in, on the strip's hover row: one circle with the level's
// number (A for Auto). A swipe moves it one level (two fingers dragged right or left on the strip, or
// any scroll on the circle: useLevelStep, wheel.ts) and the circle is tugged that way: it stretches,
// presses against the side it was pulled to and springs back, and the number changes inside it (the
// white circle is only the open slider's handle). At either end it tugs and springs back with no change. A swipe never
// opens the levels; hovering, clicking or focusing the circle does: it slides open into the six
// levels and becomes a slider (the white circle is its handle; pressing a level or dragging across
// them moves it there; so do a swipe on it, one level a swipe, and the arrow keys). Moving away, or Esc, folds it back. Each level's name is
// in its tooltip. For people who ask for reduced motion the number just changes.
import { AnimatePresence, motion, useAnimate, type Variants } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { languageName } from '../../../shared/languages'
import { AUTO, MAX_LEVEL } from '../../../shared/levels'
import type { Level, OverlaySettings } from '../../../shared/types'
import { EASE_IN, EASE_OUT, GLIDE, GLIDING, reducedMotion, SPRING } from '../components/motion'
import { levelAt } from './levels'
import type { Tug } from './useLevelStep'
import { WheelSteps } from './wheel'
import { LEVELS } from './words'

// Moving the pointer off the open slider folds it after this long (it can come back meanwhile).
const CLOSE_MS = 400
// After a swipe, hovering waits this long before it opens the levels.
const SETTLE_MS = 500
// Springs back past where it rests, a little, and settles.
const SNAP = [0.34, 1.56, 0.64, 1] as const

// The number: the old one leaves the way the circle was pulled; the new one comes in from the
// other side as the circle springs back.
const DIGIT: Variants = {
  enter: (way: number) => ({ x: -9 * way, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { delay: 0.14, duration: 0.18, ease: EASE_OUT } },
  leave: (way: number) => ({ x: 9 * way, opacity: 0, transition: { duration: 0.12, ease: EASE_IN } })
}

export function LevelSlider({
  settings,
  tug,
  onStep
}: {
  settings: OverlaySettings
  /** The last swipe's tug (useLevelStep). */
  tug?: Tug
  /** One level on (1) or back (-1), from a swipe on the circle. */
  onStep: (direction: number) => void
}): React.JSX.Element {
  const language = languageName(settings.language)
  const wheel = useRef(new WheelSteps())
  // Open since which tug: a newer tug (a swipe) folds it, with no state to set.
  const [openSince, setOpenSince] = useState<number | null>(null)
  const open = openSince !== null && openSince >= (tug?.count ?? 0)
  const show = (): void => setOpenSince(tug?.count ?? 0)
  // Just after a swipe the circle folds under a still pointer, which the browser can take as the
  // pointer coming onto it: hovering only opens it once the swipe has settled.
  const swipedAt = useRef(0)
  useEffect(() => {
    if (tug) swipedAt.current = performance.now()
  }, [tug])
  const hoverShow = (): void => {
    if (performance.now() - swipedAt.current > SETTLE_MS) show()
  }
  const closing = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closing.current), [])
  const keep = (): void => window.clearTimeout(closing.current)
  const fold = (): void => {
    keep()
    closing.current = window.setTimeout(() => setOpenSince(null), CLOSE_MS)
  }
  const current = LEVELS.find((item) => item.level === settings.level)!
  const describe = (item: (typeof LEVELS)[number]): string => `${item.mark} · ${item.name} ${language}: swaps in ${item.adds}`
  const set = (level: Level): void => {
    if (level !== settings.level) window.duet.setLevel(level)
  }
  const go = (steps: number): void => {
    if (steps) set(Math.min(MAX_LEVEL, Math.max(AUTO, settings.level + steps)) as Level)
  }

  // Dragging the handle: the level under the pointer, as it moves.
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pick = (clientX: number): void => {
    const box = track.current?.getBoundingClientRect()
    if (box) set(levelAt(clientX - box.left))
  }

  // Each swipe plays its tug on the circle.
  const [blob, animate] = useAnimate<HTMLSpanElement>()
  const way = tug?.direction ?? 1
  useEffect(() => {
    if (!tug || !blob.current || reducedMotion()) return
    const pull = tug.direction
    if (!tug.moved) {
      // At the end: a short tug, and back.
      animate(blob.current, { x: [0, 4 * pull, 0], scaleX: [1, 1.16, 1], scaleY: [1, 0.92, 1] }, { duration: 0.34, ease: EASE_OUT })
      return
    }
    // Pulled (stretching), pressed against the side (squashing), sprung back.
    animate(
      blob.current,
      { x: [0, 3 * pull, 12 * pull, 0], scaleX: [1, 1.3, 0.78, 1], scaleY: [1, 0.86, 1.12, 1] },
      { duration: 0.48, times: [0, 0.3, 0.52, 1], ease: [EASE_OUT, EASE_IN, SNAP] }
    )
  }, [tug, blob, animate])

  return (
    <motion.div
      layout
      // Folded by a swipe: at once, so the fold and the tug don't run together; otherwise it glides.
      transition={openSince !== null && !open ? { layout: { duration: 0 } } : GLIDE}
      style={{ borderRadius: 14 }}
      className={`act level-slider${open ? ' open' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={`How much ${language} in each line`}
      aria-valuemin={AUTO}
      aria-valuemax={MAX_LEVEL}
      aria-valuenow={settings.level}
      aria-valuetext={describe(current)}
      title={open ? undefined : describe(current)}
      onMouseEnter={() => {
        keep()
        hoverShow()
      }}
      onMouseLeave={() => {
        if (!dragging.current) fold()
      }}
      onFocus={show}
      onClick={show}
      // A swipe on the open levels moves the handle along them, one level a swipe; on the folded
      // circle it's a swipe like any other: the circle is tugged, nothing opens.
      onWheel={(event) => {
        const steps = wheel.current.step(event.deltaY, event.deltaX, event.timeStamp)
        if (open) go(steps)
        else onStep(steps)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') go(1)
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') go(-1)
        else if (event.key === 'Escape') setOpenSince(null)
        else return
        event.preventDefault()
      }}
    >
      {open ? (
        <div
          ref={track}
          className="level-track"
          onPointerDown={(event) => {
            dragging.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            pick(event.clientX)
          }}
          onPointerMove={(event) => dragging.current && pick(event.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onLostPointerCapture={(event) => {
            dragging.current = false
            if (!event.currentTarget.parentElement?.matches(':hover')) fold()
          }}
        >
          {LEVELS.map((item) => (
            <span key={item.level} className="level-slot" title={describe(item)}>
              {/* The handle: one circle, gliding to the level chosen. */}
              {item.level === settings.level && <motion.span layoutId="level-handle" className="level-handle" transition={SPRING} />}
              <motion.span layoutId={`level-${item.level}`} transition={GLIDING} className={`level-digit${item.level === settings.level ? ' on' : ''}`}>
                {item.mark}
              </motion.span>
            </span>
          ))}
        </div>
      ) : (
        // The circle the swipes tug: it stretches from the side it's pulled from (origin).
        // Its frame keeps it round while the button folds (layout); inside, the circle itself.
        <motion.span layout className="level-frame">
        <motion.span ref={blob} className="level-blob" style={{ originX: way > 0 ? 0 : 1 }}>
          <AnimatePresence initial={false} mode="popLayout" custom={way}>
            <motion.span
              key={settings.level}
              layoutId={`level-${settings.level}`}
              className="level-digit"
              custom={way}
              variants={DIGIT}
              initial="enter"
              animate="center"
              exit="leave"
            >
              {current.mark}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        </motion.span>
      )}
    </motion.div>
  )
}
