// A two-finger swipe toward the screen's right edge (where the panel sits) slides the panel window
// with the fingers; let go past SWIPE_CLOSE and it slides off and closes, else it slides back.
// Mostly-vertical scrolling is left alone, as is anything that scrolls sideways itself.
import { useEffect } from 'react'

const SWIPE_CLOSE = 120
// The swipe has ended when no more scrolling comes for this long (macOS's own glide included).
const ENDED_AFTER_MS = 140

/** Whether `target` is inside something that scrolls sideways (that scrolling is its own). */
function scrollsSideways(target: EventTarget | null): boolean {
  for (let node = target as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) return true
  }
  return false
}

export function useSwipeAway(): void {
  useEffect(() => {
    let offset = 0
    let swiping = false
    let ended: ReturnType<typeof setTimeout> | undefined
    let frame = 0
    const send = (): void => {
      frame = 0
      window.duet.panel.swipe(offset)
    }
    const end = (): void => {
      window.duet.panel.swipeEnd(offset >= SWIPE_CLOSE)
      swiping = false
      offset = 0
    }
    const onWheel = (event: WheelEvent): void => {
      if (!swiping) {
        // Starts only as a clearly sideways swipe toward the edge (fingers moving right).
        if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.5 || event.deltaX >= 0) return
        if (scrollsSideways(event.target)) return
        swiping = true
      }
      offset = Math.max(0, offset - event.deltaX)
      if (!frame) frame = requestAnimationFrame(send)
      clearTimeout(ended)
      ended = setTimeout(end, ENDED_AFTER_MS)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      clearTimeout(ended)
      cancelAnimationFrame(frame)
    }
  }, [])
}
