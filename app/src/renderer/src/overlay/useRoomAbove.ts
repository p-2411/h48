// How much room there is above the strip's dock, in the window, as the CSS variable --room on it, so
// what opens above the strip (the settings, a checkpoint, the talk bubble) is capped to fit instead
// of running off the window's top. The dock grows upward (the strip is pinned at the bottom), and the
// window can be cut shorter near the top of a screen (main/windows/overlay-size.ts).
//
// An open checkpoint is part of the dock (it grows up out of the strip), so its own height is added
// back: the room is what the window has above where the card starts. Measured from the dock's top
// alone, a card taller than the room shrank the room as it grew, which capped the card smaller,
// which gave the room back, and the card flickered between the two.
import { useEffect, type RefObject } from 'react'

export function useRoomAbove(dock: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = dock.current
    if (!element) return
    const measure = (): void => {
      const card = element.querySelector('.checkpoint')
      const top = element.getBoundingClientRect().top + (card ? card.getBoundingClientRect().height : 0)
      element.style.setProperty('--room', `${Math.max(0, Math.round(top))}px`)
    }
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
