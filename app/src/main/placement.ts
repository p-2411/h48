// Where the strip sits: on the video, where subtitles go, following it as it moves, changes size
// or goes fullscreen, and never wider than it. Once the learner drags the strip, it stays where
// they put it until the next video, which it snaps onto again. With no video in view, it goes to
// where the learner last dragged it (or the bottom of the screen).
//
// The overlay window has the strip at its bottom middle (see windows/overlay.ts), so placing the
// strip is moving the window. macOS keeps windows below the top of the screen, so on a video near
// the top the window is cut shorter from the top instead (the room above the strip for its popups
// shrinks, the strip stays put).
import { screen, type BrowserWindow, type Rectangle } from 'electron'
import type { VideoFrame } from './captions'
import type { Settings } from './settings'
import { OVERLAY, restingPosition } from './windows/overlay'

// How far above the video's bottom edge the strip's bottom sits: clear of the player's controls.
const LIFT = { share: 0.09, least: 30 }
// The strip's room on each side, inside the video.
const SIDE_ROOM = 24
// The page sometimes loses the video for a moment (a re-layout); wait this long before leaving it.
const LOST_MS = 1500

/** The video a page shows: YouTube's ?v=, otherwise the address without its query. */
export function videoKey(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const address = new URL(url)
    const id = address.searchParams.get('v')
    return id ? `${address.host}?v=${id}` : `${address.host}${address.pathname}`
  } catch {
    return url
  }
}

export class Placement {
  private frame?: VideoFrame
  private video?: string
  /** The learner moved the strip on this video, so it stays put. */
  private dragged = false
  private lost?: NodeJS.Timeout
  private follow?: NodeJS.Timeout

  constructor(
    private readonly overlay: BrowserWindow,
    private readonly settings: Settings,
    /** Tells the page how wide the strip may be (undefined: as wide as it likes). */
    private readonly fit: (maxWidth?: number) => void
  ) {
    // A page that reloads or crashes mid-drag never says the drag ended: stop following then.
    const stop = (): void => this.stopFollowing()
    overlay.webContents.on('did-start-loading', stop)
    overlay.webContents.on('render-process-gone', stop)
  }

  /** How wide the strip may be to stay inside the video (undefined: no video in view). */
  maxWidth(): number | undefined {
    return this.frame && Math.max(352, this.frame.width - SIDE_ROOM * 2)
  }

  /** The page's address, from the reader's status: a new video snaps the strip back onto it. */
  setVideo(url?: string): void {
    const key = videoKey(url)
    if (!key || key === this.video) return
    this.video = key
    this.dragged = false
    this.place()
  }

  /** Where the video is now, or undefined when none is in view. */
  setFrame(frame?: VideoFrame): void {
    if (frame) {
      clearTimeout(this.lost)
      this.lost = undefined
      this.frame = frame
      this.place()
    } else if (this.frame && !this.lost) {
      this.lost = setTimeout(() => {
        this.lost = undefined
        this.frame = undefined
        this.place()
      }, LOST_MS)
    }
  }

  /** Dragging: until it ends, the window follows the pointer, keeping the offset it was grabbed at. */
  drag(phase: 'start' | 'end'): void {
    if (this.overlay.isDestroyed()) return
    this.stopFollowing()
    if (phase === 'start') {
      this.dragged = true
      const grab = screen.getCursorScreenPoint()
      const [x, y] = this.overlay.getPosition()
      let last = grab
      this.follow = setInterval(() => {
        if (this.overlay.isDestroyed()) return this.stopFollowing()
        const now = screen.getCursorScreenPoint()
        // Only move when the pointer did.
        if (now.x === last.x && now.y === last.y) return
        last = now
        this.overlay.setPosition(now.x - (grab.x - x), now.y - (grab.y - y))
      }, 1000 / 60)
    } else {
      const [x, y] = this.overlay.getPosition()
      this.settings.update({ overlayPosition: { x, y } })
    }
  }

  private stopFollowing(): void {
    clearInterval(this.follow)
    this.follow = undefined
  }

  private place(): void {
    if (this.overlay.isDestroyed()) return
    const frame = this.frame
    this.fit(this.maxWidth())
    if (this.dragged || this.follow) return
    if (!frame) {
      const { x, y } = restingPosition(this.settings)
      return this.put({ x, y, width: OVERLAY.width, height: OVERLAY.height })
    }
    const x = Math.round(frame.x + frame.width / 2 - OVERLAY.width / 2)
    // The strip's bottom is the window's bottom, less the stage's padding.
    const bottom = Math.round(frame.y + frame.height - Math.max(LIFT.least, frame.height * LIFT.share) + OVERLAY.padding)
    const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(frame.x + frame.width / 2), y: bottom })
    const top = Math.max(bottom - OVERLAY.height, workArea.y)
    this.put({ x, y: top, width: OVERLAY.width, height: bottom - top })
  }

  private put(bounds: Rectangle): void {
    const now = this.overlay.getBounds()
    // Small changes (a pixel of re-layout) aren't worth moving for.
    const moved = (['x', 'y', 'width', 'height'] as const).some((side) => Math.abs(bounds[side] - now[side]) > 1)
    if (moved) this.overlay.setBounds(bounds)
  }
}
