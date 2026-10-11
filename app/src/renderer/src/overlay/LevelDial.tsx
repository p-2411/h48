// The dark housing stays still; only its white inner surface flows sideways and refills.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reducedMotion } from '../components/motion'
import type { LevelSwipe } from './useLevelSwipe'

const SPRING = 'cubic-bezier(0.16, 1, 0.3, 1)'
const pose = (x: number, width: number): string =>
  `translate3d(${x}px, 0, 0) scaleX(${width})`
// Numerals can travel with the liquid but always retain their original proportions.
const digitPose = (x = 0): string => `translate3d(${Math.round(x)}px, 0, 0)`

export function LevelDial({ swipe }: { swipe: LevelSwipe }): React.JSX.Element {
  const surface = useRef<HTMLSpanElement>(null)
  const number = useRef<HTMLSpanElement>(null)
  const previous = useRef(swipe.level)
  const [shown, setShown] = useState(swipe.level)
  const animations = useRef<Animation[]>([])
  const swap = useRef<number | undefined>(undefined)
  const pull = swipe.dragging ? swipe.position - swipe.level : 0

  useLayoutEffect(() => {
    const disc = surface.current
    const digit = number.current
    if (!disc || !digit) return
    // Sample before cancelling, so reversing or starting another swipe never jumps to rest.
    const discFrom = getComputedStyle(disc).transform
    const digitFrom = getComputedStyle(digit).transform
    const opacityFrom = getComputedStyle(digit).opacity
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
    disc.style.transform = pose(0, 1)
    digit.style.transform = digitPose()
    digit.style.opacity = '1'
    window.clearTimeout(swap.current)
    const changed = swipe.level !== previous.current
    const direction = Math.sign(swipe.level - previous.current) || Math.sign(pull) || 1
    previous.current = swipe.level
    const animate = (element: Element, frames: Keyframe[], duration: number, easing = SPRING): void => {
      animations.current.push(element.animate(frames, { duration, easing, fill: 'forwards' }))
    }
    if (reducedMotion()) {
      setShown(swipe.level)
      return
    }
    if (swipe.dragging) {
      setShown(swipe.level)
      const amount = Math.min(1, Math.abs(pull))
      const stretch = amount < 0.3 ? 1 + amount / 0.3 * 0.12 : 1.12 - (amount - 0.3) / 0.7 * 0.51
      const offset = amount < 0.3 ? amount / 0.3 : 1 + (amount - 0.3) / 0.7 * 4
      // Track input directly: restarting an eased tween on each wheel event trails the fingers.
      disc.style.transform = pose(direction * offset, stretch)
      digit.style.transform = digitPose(direction * amount * 3)
      digit.style.opacity = '1'
    } else if (changed) {
      animate(disc, [
        { transform: discFrom, offset: 0 },
        { transform: pose(direction * 5.5, 0.6), offset: 0.18, easing: SPRING },
        { transform: pose(-direction * 0.4, 1.04), offset: 0.72, easing: SPRING },
        { transform: pose(0, 1), offset: 1 }
      ], 240, 'linear')
      animate(digit, [
        { transform: digitFrom, opacity: opacityFrom },
        { transform: digitPose(direction * 4), opacity: 0 }
      ], 30, 'ease-in')
      swap.current = window.setTimeout(() => {
        setShown(swipe.level)
        animate(digit, [
          { transform: digitPose(direction * 3), opacity: 0 },
          { transform: digitPose(), opacity: 1 }
        ], 150)
      }, 30)
    } else {
      setShown(swipe.level)
      animate(disc, [{ transform: discFrom }, { transform: pose(0, 1) }], 200)
      animate(digit, [{ transform: digitFrom, opacity: opacityFrom }, { transform: digitPose(), opacity: 1 }], 160)
    }
  }, [swipe.level, swipe.dragging, pull])

  useEffect(() => () => {
    window.clearTimeout(swap.current)
    animations.current.forEach(animation => animation.cancel())
  }, [])

  return <>
    <span ref={surface} className="level-dial-surface" aria-hidden="true" />
    <span ref={number} className="level-dial-number" aria-hidden="true">{shown === 0 ? 'A' : shown}</span>
  </>
}
