// The side panel, main-process side: one window beside the video with tabs. Script lists every line
// of the video (the whole transcript when there is one) and follows the video; clicking a line goes
// back to it. Explain is src/main/explain, shown in this window. The window remembers where the
// learner leaves it, and its size.
//
// IPC (all "panel:*"; the page reaches them through window.duet.panel in src/preload/panel.ts):
//   panel:get-state    → { tab, script, current }
//   panel:tab / panel:script / panel:script-line / panel:current   ← updates
//   panel:set-tab      the learner switched tabs
//   panel:seek         goes back to a line
//   panel:get-look     → { dark }: the home base's look, which the panel follows
//   panel:look         ← the look changed
import { EventEmitter } from 'events'
import { ipcMain, type BrowserWindow } from 'electron'
import type { Moment } from '../../shared/moment'
import type { PanelTab } from '../../shared/types'
import type { Settings } from '../settings'
import type { Watcher } from '../watcher'
import { isFrom } from '../windows/from'
import { boundsOnVideo, createPanelWindow } from '../windows/panel'
import type { VideoFrame } from '../captions'

// A swiped-away or let-go panel glides off, or back, over this long.
const GLIDE_MS = 180

export class Panel extends EventEmitter {
  private window?: BrowserWindow
  private tab: PanelTab = 'script'
  private dark = false
  /** Where the window was when a swipe began (its x), while one is going on. */
  private swipeFrom?: number

  constructor(
    private readonly options: {
      watcher: Watcher
      settings: Settings
      replay: (moment: Moment) => void
      /** Where the video is on screen, if one is in view: the panel opens on it. */
      videoFrame?: () => VideoFrame | undefined
    }
  ) {
    super()
    const { watcher, replay } = options
    ipcMain.handle('panel:get-state', () => ({ tab: this.tab, script: watcher.script, current: watcher.currentLine?.id ?? null }))
    ipcMain.handle('panel:get-look', () => ({ dark: this.dark }))
    ipcMain.on('panel:set-tab', (_, tab: PanelTab) => (this.tab = tab))
    // Swiped toward the screen's edge: the window follows, then slides off and closes, or back.
    ipcMain.on('panel:swipe', (event, offset: unknown) => {
      const window = this.window
      if (!window || window.isDestroyed() || !this.owns(event.sender) || typeof offset !== 'number') return
      this.swipeFrom ??= window.getPosition()[0]
      const [, y] = window.getPosition()
      window.setPosition(Math.round(this.swipeFrom + Math.max(0, Math.min(offset, 2000))), y)
    })
    ipcMain.on('panel:swipe-end', (event, close: unknown) => {
      const window = this.window
      const from = this.swipeFrom
      this.swipeFrom = undefined
      if (!window || window.isDestroyed() || !this.owns(event.sender) || from === undefined) return
      const [x, y] = window.getPosition()
      const to = close ? x + window.getBounds().width + 40 : from
      glide(window, x, to, y, () => close && !window.isDestroyed() && window.close())
    })
    ipcMain.on('panel:seek', (_, lineId: number) => {
      const moment = watcher.moment(lineId)
      if (moment) replay(moment)
    })
    watcher.on('script', (script) => this.send('panel:script', script))
    watcher.on('script-line', (line) => this.send('panel:script-line', line))
    watcher.on('current', (id) => this.send('panel:current', id))
  }

  /** Opens the panel (or brings it forward) on a tab. */
  show(tab: PanelTab): void {
    this.tab = tab
    if (!this.window || this.window.isDestroyed()) {
      const frame = this.options.videoFrame?.()
      const window = (this.window = createPanelWindow(
        frame ? boundsOnVideo(frame) : this.options.settings.current.panelBounds
      ))
      window.setBackgroundColor(ground(this.dark))
      // Saved once the learner stops moving or resizing it.
      let saving: NodeJS.Timeout | undefined
      const save = (): void => {
        clearTimeout(saving)
        saving = setTimeout(() => window.isDestroyed() || this.options.settings.update({ panelBounds: window.getBounds() }), 400)
      }
      window.on('moved', save)
      window.on('resized', save)
      window.on('closed', () => {
        clearTimeout(saving)
        this.window = undefined
        this.emit('closed')
      })
    } else {
      this.window.show()
      this.send('panel:tab', tab)
    }
  }

  /** Draws the panel light or dark, as the home base is. */
  setDark(dark: boolean): void {
    if (dark === this.dark) return
    this.dark = dark
    if (this.window && !this.window.isDestroyed()) this.window.setBackgroundColor(ground(dark))
    this.send('panel:look', { dark })
  }

  /** Whether a message came from the panel's page (the only page allowed to talk to the tutor). */
  owns(sender: Electron.WebContents): boolean {
    return isFrom(this.window, sender)
  }

  send(channel: string, payload: unknown): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, payload)
  }
}

/** Moves the window from x `from` to `to` over a moment, easing out, then `done`. */
function glide(window: BrowserWindow, from: number, to: number, y: number, done: () => void): void {
  const started = Date.now()
  const tick = setInterval(() => {
    if (window.isDestroyed()) return clearInterval(tick)
    const t = Math.min(1, (Date.now() - started) / GLIDE_MS)
    const eased = 1 - (1 - t) ** 3
    window.setPosition(Math.round(from + (to - from) * eased), y)
    if (t < 1) return
    clearInterval(tick)
    done()
  }, 1000 / 60)
}

/** The paper the panel is drawn on (home-tokens.css's --ground), shown before the page paints. */
function ground(dark: boolean): string {
  return dark ? '#121313' : '#f2f3f3'
}
