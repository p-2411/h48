// A horizontal trackpad gesture changes level as soon as the pull crosses its threshold.
// Limit each gesture to a neighbour so trackpad momentum cannot race through all five levels.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Level } from '../../../shared/types'
import { WheelSteps } from './wheel'

const TRAVEL_PX = 32
const RELEASE_MS = 220
const COAST_MS = 140
const LINGER_MS = 950
const clampLevel = (value: number): number => Math.max(0, Math.min(5, value))

export function useLevelSwipe(level: Level, host: RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<number>(level)
  const [settled, setSettled] = useState(level)
  const [dragging, setDragging] = useState(false)
  const [visible, setVisible] = useState(false)
  const [gestureId, setGestureId] = useState(0)
  const selected = useRef(level)
  const gesture = useRef<{
    start: Level; distance: number; committed: boolean
    lastAt: number; lastDelta: number; peak: number; coasting: boolean; reverse: number
  } | null>(null)
  const release = useRef<number | undefined>(undefined)
  const hide = useRef<number | undefined>(undefined)
  const wheel = useRef(new WheelSteps())

  const linger = useCallback(() => {
    window.clearTimeout(hide.current)
    setVisible(true)
    hide.current = window.setTimeout(() => setVisible(false), LINGER_MS)
  }, [])

  const select = useCallback((next: Level) => {
    window.clearTimeout(release.current)
    gesture.current = null
    setDragging(false)
    setPosition(next)
    setSettled(next)
    if (next !== selected.current) {
      selected.current = next
      window.duet.setLevel(next)
    }
    linger()
  }, [linger])

  const dismiss = useCallback(() => {
    window.clearTimeout(release.current)
    window.clearTimeout(hide.current)
    gesture.current = null
    setDragging(false)
    setPosition(selected.current)
    setVisible(false)
  }, [])

  useEffect(() => {
    selected.current = level
    setSettled(level)
    if (!gesture.current) setPosition(level)
  }, [level])

  useEffect(() => {
    const element = host.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      const control = target?.closest('.level-control')
      if (!control && (!target?.closest('.strip') || target.closest('button, a, .popup'))) return
      // Once sideways intent is established, keep the gesture despite vertical finger drift.
      const horizontal = !!gesture.current || (Math.abs(event.deltaX) > 0 && Math.abs(event.deltaX) >= Math.abs(event.deltaY) * 0.9)
      // Vertical scrolling over captions belongs to the video, not the difficulty control.
      if (!horizontal && !control) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
      if (!event.deltaX && !event.deltaY) return
      event.preventDefault()
      if (!horizontal) {
        const step = wheel.current.step(event.deltaY * unit, 0, event.timeStamp)
        if (step) select(clampLevel(selected.current + step) as Level)
        return
      }
      // Natural trackpad scrolling reports content movement, opposite to the fingers' movement.
      const fingerDelta = -event.deltaX * unit
      if (!fingerDelta) return

      window.clearTimeout(hide.current)
      window.clearTimeout(release.current)
      let current = gesture.current
      const magnitude = Math.abs(fingerDelta)
      let initialDistance = 0
      let fresh = !current
      if (current?.committed) {
        const reversed = Math.sign(fingerDelta) !== Math.sign(current.distance)
        current.reverse = reversed ? current.reverse + fingerDelta : 0
        // Wheel events have no finger-up marker. A pause or a renewed burst after the tail
        // slows down signals a fresh swipe; steady/decaying momentum still counts just once.
        const resumed = event.timeStamp - current.lastAt >= 80 && magnitude >= 6
        const renewed = current.coasting && magnitude >= Math.max(6, current.lastDelta * 1.65) && magnitude - current.lastDelta >= 3
        fresh = Math.abs(current.reverse) >= 10 || (!reversed && (resumed || renewed))
        if (fresh && reversed) initialDistance = current.reverse - fingerDelta
      }
      if (!current || fresh) {
        current = { start: selected.current, distance: initialDistance, committed: false,
          lastAt: event.timeStamp, lastDelta: magnitude, peak: magnitude, coasting: false, reverse: 0 }
        setGestureId(value => value + 1)
      }
      current.peak = Math.max(current.peak, magnitude)
      if (magnitude < current.peak * 0.4) current.coasting = true
      current.lastAt = event.timeStamp
      current.lastDelta = magnitude
      setVisible(true)
      if (!current.committed) {
        current.distance = Math.max(-TRAVEL_PX, Math.min(TRAVEL_PX, current.distance + fingerDelta))
        if (Math.abs(current.distance) >= TRAVEL_PX) {
          current.committed = true
          select(clampLevel(current.start + Math.sign(current.distance)) as Level)
        } else {
          setDragging(true)
          setPosition(clampLevel(current.start + current.distance / TRAVEL_PX))
        }
      }
      gesture.current = current
      release.current = window.setTimeout(() => {
        gesture.current = null
        if (current.committed) linger()
        else select(current.start)
      }, current.committed ? COAST_MS : RELEASE_MS)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      window.clearTimeout(release.current)
      window.clearTimeout(hide.current)
    }
  }, [host, select, linger])

  return { position, level: settled, dragging, visible, gestureId, select, dismiss }
}

export type LevelSwipe = ReturnType<typeof useLevelSwipe>
