// How much room there is above the strip's dock, in the window, as the CSS variable --room on it, so
// what opens above the strip (the settings, a checkpoint, the talk bubble) is capped to fit instead
// of running off the window's top. The dock grows upward (the strip is pinned at the bottom), and the
// window can be cut shorter near the top of a screen (main/windows/overlay-size.ts).
import { useEffect, type RefObject } from 'react'

export function useRoomAbove(dock: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = dock.current
    if (!element) return
    const measure = (): void => element.style.setProperty('--room', `${Math.max(0, Math.round(element.getBoundingClientRect().top))}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [dock])
}
