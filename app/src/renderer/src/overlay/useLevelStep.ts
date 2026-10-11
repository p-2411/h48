// One level up or down at a time, from a swipe (two fingers dragged sideways on the strip, or any
// scroll on the level circle), with the tug the level circle plays to show it (LevelSlider): which
// way, whether the level moved (at either end it can't: the circle tugs and springs back), and a
// count, so each step plays even when two come the same way. Quick swipes add up, though the
// settings take a moment to come back.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTO, MAX_LEVEL } from '../../../shared/levels'
import type { Level } from '../../../shared/types'

export type Tug = { direction: 1 | -1; moved: boolean; count: number }

export function useLevelStep(level: Level): { step: (direction: number) => void; tug?: Tug } {
  const [tug, setTug] = useState<Tug>()
  // The level asked for last, until the settings say what it is.
  const target = useRef(level)
  useEffect(() => {
    target.current = level
  }, [level])
  const step = useCallback((direction: number) => {
    if (!direction) return
    const way = direction > 0 ? 1 : -1
    const next = Math.min(MAX_LEVEL, Math.max(AUTO, target.current + way)) as Level
    const moved = next !== target.current
    if (moved) {
      target.current = next
      window.duet.setLevel(next)
    }
    setTug((last) => ({ direction: way, moved, count: (last?.count ?? 0) + 1 }))
  }, [])
  return { step, tug }
}
