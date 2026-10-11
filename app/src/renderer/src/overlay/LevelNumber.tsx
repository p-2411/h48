// Trackpad gestures tug the single circle; the full chooser opens only when reached for directly.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { languageName } from '../../../shared/languages'
import type { Level, OverlaySettings } from '../../../shared/types'
import type { LevelSwipe } from './useLevelSwipe'
import { LEVELS } from './words'
import { LevelDial } from './LevelDial'
import { levelAt } from './levels'

// Moving the pointer off the open row closes it after this long (it can come back meanwhile).
const CLOSE_MS = 400

export function LevelNumber({ settings, swipe }: { settings: OverlaySettings; swipe: LevelSwipe }): React.JSX.Element {
  const language = languageName(settings.language)
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const focusOnOpen = useRef(false)
  const expanded = open && !swipe.dragging
  const closing = useRef<number | undefined>(undefined)
  const dragging = useRef(false)
  useEffect(() => () => window.clearTimeout(closing.current), [])
  // A swipe over the captions closes the row (the circle shows the level while it moves).
  const [gestureSeen, setGestureSeen] = useState(swipe.gestureId)
  if (swipe.gestureId !== gestureSeen) {
    setGestureSeen(swipe.gestureId)
    if (swipe.gestureId) setOpen(false)
  }
  const current = LEVELS.find((item) => item.level === settings.level)!
  const describe = (item: (typeof LEVELS)[number]): string => `${item.mark} · ${item.name} ${language}: swaps in ${item.adds}`
  const pick = (clientX: number): void => {
    const box = row.current?.getBoundingClientRect()
    if (box) swipe.select(levelAt(clientX - box.left - 2))
  }
  const keep = (): void => window.clearTimeout(closing.current)
  useEffect(() => {
    if (expanded && focusOnOpen.current) {
      row.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
      focusOnOpen.current = false
    }
  }, [expanded])

  if (!expanded)
    return (
      <button
        type="button"
        className="act level-number level-control"
        aria-label={`How much ${language} in each line: ${describe(current)}. Press to choose, or swipe horizontally over the captions.`}
        title="Swipe right over captions to increase the level; left to decrease"
        aria-expanded={false}
        onMouseEnter={() => {
          keep()
          if (!swipe.visible) setOpen(true)
        }}
        onClick={(event) => {
          focusOnOpen.current = event.detail === 0
          setOpen(true)
        }}
      >
        <LevelDial swipe={swipe} />
      </button>
    )
  return (
    <div
      ref={row}
      className={`act level-row level-control${swipe.dragging ? ' scrubbing' : ''}`}
      style={{ '--level-x': `${swipe.position * 26}px`, touchAction: 'none' } as CSSProperties}
      role="radiogroup"
      aria-label={`How much ${language} in each line`}
      onMouseEnter={keep}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        pick(event.clientX)
      }}
      onPointerMove={(event) => { if (dragging.current) pick(event.clientX) }}
      onPointerUp={() => { dragging.current = false }}
      onLostPointerCapture={() => { dragging.current = false }}
      onMouseLeave={() => {
        if (dragging.current) return
        keep()
        closing.current = window.setTimeout(() => setOpen(false), CLOSE_MS)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          swipe.dismiss()
          setOpen(false)
        }
        const at = Number((event.target as HTMLElement).closest('button')?.dataset.level ?? settings.level)
        const next = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(5, at + 1)
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, at - 1)
            : event.key === 'Home' ? 0 : event.key === 'End' ? 5 : undefined
        if (next !== undefined) {
          event.preventDefault()
          swipe.select(next as Level)
          row.current?.querySelector<HTMLButtonElement>(`[data-level="${next}"]`)?.focus()
        }
      }}
    >
      <span className="level-thumb" aria-hidden="true" />
      {LEVELS.map((item) => (
        <button
          key={item.level}
          type="button"
          role="radio"
          data-level={item.level}
          tabIndex={item.level === settings.level ? 0 : -1}
          aria-checked={item.level === settings.level}
          aria-label={describe(item)}
          title={describe(item)}
          className={item.level === Math.round(swipe.position) ? 'on' : undefined}
          onClick={() => {
            swipe.select(item.level)
            setOpen(false)
          }}
        >
          {item.mark}
        </button>
      ))}
    </div>
  )
}
