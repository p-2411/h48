// A tile and its page are one surface at two sizes. Opening: a solid surface covers the tile (its
// content goes at once), grows to fill the window, then thins away under the page's content as that
// rises in. Closing: the page's content goes as the surface turns solid again, the surface shrinks
// to the tile's exact place and corners, then thins away over the tile. It is never see-through on
// the way. The surface moves by transform alone (a move and a scale, run by the GPU), so it stays
// smooth while the page mounts or the hub paints; its corners are scaled the other way so they keep
// the tile's. For people who ask for reduced motion the page and the hub only cross-fade.
import { useCallback, useRef, useState, type RefObject } from 'react'
import { DURATION, reducedMotion } from '../components/motion'

export type Stage = 'closed' | 'growing' | 'open' | 'shrinking'

// Leaving the page and the tile's own quick fades, in ms; the grow and the shrink.
const QUICK = 80
const GROW = { duration: 340, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' } as const
const SHRINK = {
  duration: 300,
  easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
  fill: 'forwards'
} as const

type Frame = { transform: string; borderRadius: string }
const FULL: Frame = { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '0px / 0px' }

/** The surface (the size of `root`) moved and scaled onto `element`, with `element`'s corners. */
function frameOf(element: Element, root: Element): Frame {
  const a = element.getBoundingClientRect()
  const b = root.getBoundingClientRect()
  const x = a.width / b.width
  const y = a.height / b.height
  const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
  return {
    transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${x}, ${y})`,
    borderRadius: `${radius / x}px / ${radius / y}px`
  }
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))

export function useSurface(
  root: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLDivElement | null>,
  page: RefObject<HTMLElement | null>
): {
  stage: Stage
  /** Grows `from` (a tile, or the gear) into the page; `show` puts the page's content in place. */
  grow: (from: HTMLElement, show: () => void) => Promise<void>
  /** Shrinks the page back into the element it grew from; `hide` takes the page's content away. */
  shrink: (hide: () => void) => Promise<void>
  /** The element the open page grew from (the focus goes back to it). */
  from: RefObject<HTMLElement | null>
  /** Another page took the open one's place: it shrinks back into `element` instead. */
  retarget: (element: HTMLElement) => void
} {
  const [stage, setStage] = useState<Stage>('closed')
  const from = useRef<HTMLElement | null>(null)
  const busy = useRef(false)

  const grow = useCallback(
    async (element: HTMLElement, show: () => void) => {
      if (busy.current) return
      busy.current = true
      from.current = element
      setStage('growing')
      await nextFrame()
      const layer = surface.current
      const box = root.current
      if (layer && box && !reducedMotion()) {
        const tile = frameOf(element, box)
        await layer.animate(
          [
            { ...tile, opacity: 0 },
            { ...tile, opacity: 1 }
          ],
          { duration: QUICK, fill: 'forwards' }
        ).finished
        await layer.animate([tile, FULL], GROW).finished
      }
      show()
      setStage('open')
      if (layer && !reducedMotion())
        await layer.animate(
          [
            { ...FULL, opacity: 1 },
            { ...FULL, opacity: 0 }
          ],
          { duration: DURATION.base * 1000, fill: 'forwards' }
        ).finished
      busy.current = false
    },
    [root, surface]
  )

  const shrink = useCallback(
    async (hide: () => void) => {
      if (busy.current || !from.current) return
      busy.current = true
      const layer = surface.current
      const box = root.current
      if (layer && box && !reducedMotion()) {
        await Promise.all([
          layer.animate(
            [
              { ...FULL, opacity: 0 },
              { ...FULL, opacity: 1 }
            ],
            { duration: QUICK, fill: 'forwards' }
          ).finished,
          page.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: QUICK,
            fill: 'forwards'
          }).finished
        ])
        hide()
        setStage('shrinking')
        await nextFrame()
        const tile = frameOf(from.current, box)
        await layer.animate([FULL, tile], SHRINK).finished
        await layer.animate(
          [
            { ...tile, opacity: 1 },
            { ...tile, opacity: 0 }
          ],
          { duration: 100, fill: 'forwards' }
        ).finished
      } else {
        hide()
      }
      setStage('closed')
      busy.current = false
    },
    [root, surface, page]
  )

  const retarget = useCallback((element: HTMLElement) => {
    from.current = element
  }, [])

  return { stage, grow, shrink, from, retarget }
}
