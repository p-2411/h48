import { useLayoutEffect, useRef, type RefObject } from 'react'
import { reducedMotion } from '../components/motion'

const OPEN_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const CLOSE_MS = 420
const CLOSE_EASE = 'cubic-bezier(0.32, 0, 0.2, 1)'

function socketPose(socket: HTMLElement): Keyframe {
  const style = getComputedStyle(socket)
  return {
    width: style.width,
    height: style.height,
    borderRadius: style.borderRadius,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    scale: style.scale,
    transform: style.transform
  }
}

/** Retain the current pose when direction changes, including a close during takeoff. */
export function useTalkMotion(
  active: boolean,
  present: boolean,
  origin: RefObject<HTMLButtonElement | null>,
  bubble: RefObject<HTMLDivElement | null>,
  onReturned: () => void
): void {
  const interrupted = useRef<{
    target: HTMLElement
    transform: string
    opacity: string
    sockets: Keyframe[]
  } | null>(null)

  useLayoutEffect(() => {
    if (!present) {
      interrupted.current = null
      return
    }
    const source = origin.current?.querySelector<SVGSVGElement>('svg')
    const target = bubble.current?.querySelector<HTMLElement>('.talk-avatar')
    const mascot = target?.querySelector<HTMLElement>('.duet-mascot')
    if (!source || !target || !mascot || reducedMotion()) {
      if (!active) onReturned()
      return
    }
    const sockets = [...mascot.querySelectorAll<HTMLElement>('.socket')]
    const from = source.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    if (!from.width || !to.width || sockets.length !== 2) {
      if (!active) onReturned()
      return
    }

    // The opening mark is 266.8 canvas pixels wide, centred in the 420 x 190 face.
    // This also gives the return its exact destination after the face has changed expression.
    const face = mascot.getBoundingClientRect()
    const markWidth = source.getBBox().width * from.width / source.viewBox.baseVal.width
    const scale = markWidth / (266.8 * face.width / 420)
    const x = from.left + from.width / 2 - to.left - (face.left + face.width / 2 - to.left) * scale
    const y = from.top + from.height / 2 - to.top - (face.top + face.height / 2 - to.top) * scale
    const docked = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    const prior = interrupted.current?.target === target ? interrupted.current : null
    const animations: Animation[] = []
    let disposed = false
    const animate = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions): Animation => {
      const animation = element.animate(frames, options)
      animations.push(animation)
      return animation
    }

    if (active) {
      animate(target, [
        { transform: prior?.transform ?? docked },
        { transform: 'translate3d(0, 0, 0) scale(1)' }
      ], { duration: 560, easing: OPEN_EASE })
      animate(target, [{ opacity: prior?.opacity ?? 0 }, { opacity: 1 }], { duration: 90, easing: 'ease-out' })
      animate(source, [
        { opacity: 1 }, { opacity: 0, offset: 0.12 },
        { opacity: 0, offset: 0.68 }, { opacity: 1 }
      ], { duration: 650, easing: 'ease-in-out' })
      if (prior) {
        sockets.forEach((socket, index) => {
          animate(socket, [prior.sockets[index], socketPose(socket)], { duration: 360, easing: OPEN_EASE })
        })
      }
    } else {
      // The real voice session ends immediately; only its visual shell stays for the return.
      const flight = animate(target, [
        { transform: prior?.transform ?? 'none' }, { transform: docked }
      ], { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' })
      animate(target, [
        { opacity: prior?.opacity ?? 1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }
      ], { duration: CLOSE_MS, easing: 'linear', fill: 'forwards' })
      animate(source, [
        { opacity: 0 }, { opacity: 0, offset: 0.78 }, { opacity: 1 }
      ], { duration: CLOSE_MS, easing: 'ease-in-out', fill: 'forwards' })
      sockets.forEach((socket, index) => {
        animate(socket, [prior?.sockets[index] ?? socketPose(socket), {
          width: '160px', height: '76px', borderRadius: '29px',
          backgroundColor: '#fff', borderColor: '#fff',
          scale: '1',
          transform: `translate3d(${index === 0 ? 34 : -34}px, ${index === 0 ? -25 : 25}px, 0) scale(0.98, 1.237)`
        }], { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' })
      })
      mascot.querySelectorAll('.eye, .brow, .particle-field, .sound-ring').forEach((part) => {
        animate(part, [{ opacity: getComputedStyle(part).opacity }, { opacity: 0 }], {
          duration: 140, easing: 'ease-out', fill: 'forwards'
        })
      })
      flight.finished.then(() => { if (!disposed) onReturned() }, () => {})
    }

    return () => {
      disposed = true
      if (target.isConnected) {
        const style = getComputedStyle(target)
        interrupted.current = {
          target, transform: style.transform, opacity: style.opacity,
          sockets: sockets.map(socketPose)
        }
      }
      animations.forEach((animation) => animation.cancel())
    }
  }, [active, present, origin, bubble, onReturned])
}
