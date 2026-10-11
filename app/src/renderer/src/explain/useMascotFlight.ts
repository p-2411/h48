// When Duet's typed reply arrives, the mascot that was thinking in the dock flies to the reply and
// becomes its picture. A copy of it moves and shrinks onto the picture (the mascot itself can't
// leave the dock: the conversation's scrolling part would clip it), and the dock's mascot fades
// back in behind it. People who ask for reduced motion see the picture without the flight.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { reducedMotion } from '../components/motion'

const FLIGHT_MS = 560
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** Flies the mascot from `dock` to the picture of turn `turnId` when that turn is new. */
export function useMascotFlight(
  turnId: string | undefined,
  dock: RefObject<HTMLElement | null>,
  thread: RefObject<HTMLElement | null>,
  end: RefObject<HTMLElement | null>
): void {
  // Replies already in the thread when it opens have their pictures; only a new one flies.
  const flown = useRef(turnId)
  useLayoutEffect(() => {
    if (!turnId || turnId === flown.current) return
    flown.current = turnId
    const source = dock.current?.querySelector<HTMLElement>('.duet-mascot')
    const avatar = thread.current?.querySelector<HTMLElement>(
      `[data-turn="${turnId}"] .turn-avatar`
    )
    const target = avatar?.querySelector<HTMLElement>('.duet-mascot')
    if (!source || !avatar || !target || reducedMotion()) return
    // The reply in view first, so the picture is where the flight ends.
    end.current?.scrollIntoView({ block: 'end' })
    const from = source.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    if (!from.width || !to.width) return

    const copy = source.cloneNode(true) as HTMLElement
    copy.classList.add('mascot-flight')
    copy.dataset.state = 'idle'
    Object.assign(copy.style, { left: `${from.left}px`, top: `${from.top}px` })
    document.body.append(copy)
    avatar.style.visibility = 'hidden'
    const flight = copy.animate(
      [
        { transform: 'none' },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`
        }
      ],
      { duration: FLIGHT_MS, easing: EASE, fill: 'forwards' }
    )
    source.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], {
      duration: FLIGHT_MS * 1.6,
      easing: 'ease-out'
    })
    const land = (): void => {
      avatar.style.visibility = ''
      copy.remove()
    }
    flight.finished.then(land, land)
    return () => flight.cancel()
  }, [turnId, dock, thread, end])
}
