// One level up or down at a time, from a swipe (two fingers dragged sideways on the strip, or any
// scroll on the level circle), with the tug the level circle plays to show it (LevelSlider): which
// way, whether the level moved (at either end it can't: the circle tugs and springs back), and a
// count, so each step plays even when two come the same way. Quick swipes add up, though the
// settings take a moment to come back (LevelSteps, levels.ts); the open row's arrow keys and drag
// count the same way, without a tug.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Level } from '../../../shared/types'
import { LevelSteps } from './levels'

export type Tug = { direction: 1 | -1; moved: boolean; count: number }

export type LevelStep = {
  /** A swipe: one level on (1) or back (-1), with its tug. */
  step: (direction: number) => void
  /** One level on or back from the open row (the arrow keys), with no tug. */
  nudge: (direction: number) => void
  /** A level picked on the open row. */
  pick: (level: Level) => void
  tug?: Tug
}

export function useLevelStep(level: Level): LevelStep {
  const [tug, setTug] = useState<Tug>()
  const [steps] = useState(() => new LevelSteps(level))
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else steps.heard(level, performance.now())
  }, [level, steps])
  const nudge = useCallback(
    (direction: number): boolean => {
      if (!direction) return false
      const { next, moved } = steps.step(direction, performance.now())
      if (moved) window.duet.setLevel(next)
      return moved
    },
    [steps]
  )
  const step = useCallback(
    (direction: number) => {
      if (!direction) return
      const moved = nudge(direction)
      setTug((last) => ({ direction: direction > 0 ? 1 : -1, moved, count: (last?.count ?? 0) + 1 }))
    },
    [nudge]
  )
  const pick = useCallback(
    (next: Level) => {
      if (next !== steps.target) window.duet.setLevel(steps.set(next, performance.now()))
    },
    [steps]
  )
  return { step, nudge: useCallback((direction: number) => void nudge(direction), [nudge]), pick, tug }
}
