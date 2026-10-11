// How much of the language the line swaps in, on the strip's hover row: the level's number in a
// round button like the others (A for Auto). Hovering it slides it open into the six levels, the number going to
// its place among them, and it becomes a slider: the white circle is its handle, and pressing a level
// or dragging across them moves it there (the line changes at once). Scrolling on it (the wheel, or a
// trackpad swiped any way) moves one level per swipe (wheel.ts); so do the arrow keys. Moving away,
// or Esc, folds it back into its number. Each level's name is in its tooltip.
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { languageName } from '../../../shared/languages'
import { AUTO } from '../../../shared/levels'
import type { Level, OverlaySettings } from '../../../shared/types'
import { GLIDE, GLIDING, SPRING } from '../components/motion'
import { levelAt } from './levels'
import { WheelSteps } from './wheel'
import { LEVELS } from './words'

// Moving the pointer off the open slider folds it after this long (it can come back meanwhile).
const CLOSE_MS = 400

export function LevelSlider({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  const language = languageName(settings.language)
  const wheel = useRef(new WheelSteps())
  const [open, setOpen] = useState(false)
  const closing = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closing.current), [])
  const keep = (): void => window.clearTimeout(closing.current)
  const fold = (): void => {
    keep()
    closing.current = window.setTimeout(() => setOpen(false), CLOSE_MS)
  }
  const current = LEVELS.find((item) => item.level === settings.level)!
  const describe = (item: (typeof LEVELS)[number]): string => `${item.mark} · ${item.name} ${language}: swaps in ${item.adds}`
  const set = (level: Level): void => {
    if (level !== settings.level) window.duet.setLevel(level)
  }
  const go = (steps: number): void => {
    if (steps) set(Math.min(5, Math.max(AUTO, settings.level + steps)) as Level)
  }

  // Dragging the handle: the level under the pointer, as it moves.
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pick = (clientX: number): void => {
    const box = track.current?.getBoundingClientRect()
    if (box) set(levelAt(clientX - box.left))
  }

  return (
    <motion.div
      layout
      transition={GLIDE}
      style={{ borderRadius: 14 }}
      className={`act level-slider${open ? ' open' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={`How much ${language} in each line`}
      aria-valuemin={AUTO}
      aria-valuemax={5}
      aria-valuenow={settings.level}
      aria-valuetext={describe(current)}
      title={open ? undefined : describe(current)}
      onMouseEnter={() => {
        keep()
        setOpen(true)
      }}
      onMouseLeave={() => {
        if (!dragging.current) fold()
      }}
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
      onWheel={(event) => go(wheel.current.step(event.deltaY, event.deltaX, event.timeStamp))}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') go(1)
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') go(-1)
        else if (event.key === 'Escape') setOpen(false)
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
        <motion.span layoutId={`level-${settings.level}`} transition={GLIDING} className="level-digit">
          {current.mark}
        </motion.span>
      )}
    </motion.div>
  )
}
