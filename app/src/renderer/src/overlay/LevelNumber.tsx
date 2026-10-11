// How much of the language the line swaps in, on the strip's hover row: the level's number in a
// round button like the others. Hovering it (or pressing it, from the keyboard) opens a row of the
// five levels in its place, the current one in a white circle; pressing a number sets that level and
// closes the row (so does moving away, or Esc). Scrolling on it (the wheel, or a trackpad swiped any way) also moves one level per swipe
// (wheel.ts). Each level's name is in its tooltip. The line changes at once.
import { useEffect, useRef, useState } from 'react'
import { languageName } from '../../../shared/languages'
import type { Level, OverlaySettings } from '../../../shared/types'
import { WheelSteps } from './wheel'
import { LEVELS } from './words'

// Moving the pointer off the open row closes it after this long (it can come back meanwhile).
const CLOSE_MS = 400

export function LevelNumber({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  const language = languageName(settings.language)
  const wheel = useRef(new WheelSteps())
  const [open, setOpen] = useState(false)
  const closing = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closing.current), [])
  const current = LEVELS.find((item) => item.level === settings.level)!
  const describe = (item: (typeof LEVELS)[number]): string => `${item.level} · ${item.name} ${language}: swaps in ${item.adds}`
  const go = (steps: number): void => {
    const next = Math.min(5, Math.max(1, settings.level + steps)) as Level
    if (steps && next !== settings.level) window.duet.setLevel(next)
  }
  const onWheel = (event: React.WheelEvent): void => go(wheel.current.step(event.deltaY, event.deltaX, event.timeStamp))
  const keep = (): void => window.clearTimeout(closing.current)

  if (!open)
    return (
      <button
        type="button"
        className="act level-number"
        aria-label={`How much ${language} in each line: ${describe(current)}. Press to choose.`}
        aria-expanded={false}
        onMouseEnter={() => {
          keep()
          setOpen(true)
        }}
        onClick={() => setOpen(true)}
        onWheel={onWheel}
      >
        {current.level}
      </button>
    )
  return (
    <div
      className="act level-row"
      role="radiogroup"
      aria-label={`How much ${language} in each line`}
      onWheel={onWheel}
      onMouseEnter={keep}
      onMouseLeave={() => {
        keep()
        closing.current = window.setTimeout(() => setOpen(false), CLOSE_MS)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      {LEVELS.map((item) => (
        <button
          key={item.level}
          type="button"
          role="radio"
          aria-checked={item.level === settings.level}
          aria-label={describe(item)}
          title={describe(item)}
          className={item.level === settings.level ? 'on' : undefined}
          onClick={() => {
            window.duet.setLevel(item.level)
            setOpen(false)
          }}
        >
          {item.level}
        </button>
      ))}
    </div>
  )
}
