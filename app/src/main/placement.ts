// Where the strip sits: on the video, where subtitles go, following it as it moves, changes size
// or goes fullscreen, and never wider than it. Once the learner drags the strip, it stays where
// they put it until the next video, which it snaps onto again. With no video in view, it goes to
// where the learner last dragged it (or the bottom of the screen).
//
// The overlay window has the strip at its bottom middle (see windows/overlay.ts), so placing the
// strip is moving the window. macOS keeps windows below the top of the screen, so on a video near
// the top, or when dragged up there, the window is cut shorter from the top instead (the room above
// the strip for its popups shrinks, the strip stays put; windows/overlay-size.ts).
import { screen, type BrowserWindow, type Rectangle } from 'electron'
import type { VideoFrame } from './captions'
import type { Settings } from './settings'
import { OVERLAY, restingBounds } from './windows/overlay'
import { fullTop, overlayBounds } from './windows/overlay-size'

// How far above the video's bottom edge the strip's bottom sits: clear of the player's controls.
const LIFT = { share: 0.09, least: 30 }
// The strip's room on each side, inside the video.
const SIDE_ROOM = 24
// A press that moves less than this (screen points) is a click, not a drag.
const DRAG_FROM = 4
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
  /** The press going on has moved the strip (more than a click's wobble). */
  private moving = false
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

  /** Where the video is on screen now (undefined: none in view). */
  get videoFrame(): VideoFrame | undefined {
    return this.frame
  }

  /** How wide the strip may be to stay inside the video (undefined: no video in view). */
  maxWidth(): number | undefined {
    return this.frame && Math.max(320, this.frame.width - SIDE_ROOM * 2)
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
      // Windows can drop the strip from the top when a video goes full screen (a new frame): put it
      // back on top, without a toggle.
      if (process.platform === 'win32' && !this.overlay.isDestroyed())
        this.overlay.setAlwaysOnTop(true, 'screen-saver')
      this.place()
    } else if (this.frame && !this.lost) {
      this.lost = setTimeout(() => {
        this.lost = undefined
        this.frame = undefined
        this.place()
      }, LOST_MS)
    }
  }

  /** Dragging: until it ends, the window follows the pointer, keeping the offset it was grabbed at.
   * Only a press that moves the strip counts as moving it: a click (opening the strip, a
   * checkpoint) leaves it following the video. */
  drag(phase: 'start' | 'end'): void {
    if (this.overlay.isDestroyed()) return
    this.stopFollowing()
    if (phase === 'start') {
      this.moving = false
      const grab = screen.getCursorScreenPoint()
      // Where the window's full-height top is (it may be cut near the top of the screen).
      const start = this.overlay.getBounds()
      const y = fullTop(start)
      let last = grab
      this.follow = setInterval(() => {
        if (this.overlay.isDestroyed()) return this.stopFollowing()
        const now = screen.getCursorScreenPoint()
        // Only move when the pointer did, and only once it has gone further than a click's wobble.
        if (now.x === last.x && now.y === last.y) return
        if (!this.moving && Math.hypot(now.x - grab.x, now.y - grab.y) < DRAG_FROM) return
        this.moving = true
        this.dragged = true
        last = now
        // Up to the top of the screen: the window is cut from its top so the strip can go there.
        const { workArea } = screen.getDisplayNearestPoint(now)
        this.overlay.setBounds(overlayBounds(now.x - (grab.x - start.x), now.y - (grab.y - y), workArea.y))
      }, 1000 / 60)
    } else if (this.moving) {
      this.moving = false
      const bounds = this.overlay.getBounds()
      this.settings.update({ overlayPosition: { x: bounds.x, y: fullTop(bounds) } })
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
    if (!frame) return this.put(restingBounds(this.settings))
    const x = Math.round(frame.x + frame.width / 2 - OVERLAY.width / 2)
    // The strip's bottom is the window's bottom, less the stage's padding.
    const bottom = Math.round(frame.y + frame.height - Math.max(LIFT.least, frame.height * LIFT.share) + OVERLAY.padding)
    const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(frame.x + frame.width / 2), y: bottom })
    this.put(overlayBounds(x, bottom - OVERLAY.height, workArea.y))
  }

  private put(bounds: Rectangle): void {
    const now = this.overlay.getBounds()
    // Small changes (a pixel of re-layout) aren't worth moving for.
    const moved = (['x', 'y', 'width', 'height'] as const).some((side) => Math.abs(bounds[side] - now[side]) > 1)
    if (moved) this.overlay.setBounds(bounds)
  }
}
