// The overlay window's size, and its bounds near the top of a screen. The strip sits at the window's
// bottom; macOS keeps windows below the menu bar, so where the window would start above the screen
// it is cut shorter from its top instead, and the strip still goes where it was put. Pure, so it can
// be tested without Electron.
import type { Rectangle } from 'electron'

/** The window's size, and the space below the strip inside it (the stage's bottom padding,
 * overlay.css): room for the checkpoint glow's full reach. */
export const OVERLAY = { width: 900, height: 598, padding: 44 }
// However high the strip goes, the window keeps this much: the strip, a little room above it, and
// the room below it.
const LEAST_HEIGHT = 178
// The strip's own height, roughly, for telling whether it is on a screen.
const STRIP_HEIGHT = 100

/** The window for an overlay whose (full-height) top is at `y`, cut where the screen starts. */
export function overlayBounds(x: number, y: number, screenTop: number): Rectangle {
  const top = Math.max(y, screenTop)
  return { x, y: top, width: OVERLAY.width, height: Math.max(LEAST_HEIGHT, y + OVERLAY.height - top) }
}

/** The full-height top of an overlay window (cut or not): where its bottom is, less its height. */
export function fullTop(bounds: Rectangle): number {
  return bounds.y + bounds.height - OVERLAY.height
}

/** Whether the strip of an overlay whose full-height top-left is `place` is on one of `screens`. */
export function stripOnScreen(place: { x: number; y: number }, screens: Rectangle[]): boolean {
  const middle = { x: place.x + OVERLAY.width / 2, y: place.y + OVERLAY.height - OVERLAY.padding - STRIP_HEIGHT / 2 }
  return screens.some((area) => middle.x >= area.x && middle.x <= area.x + area.width && middle.y >= area.y && middle.y <= area.y + area.height)
}
