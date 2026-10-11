// The home base, main-process side: its window (opened from the Dock, the menu bar and at launch)
// and what its page asks for. Today, Watching, My cards (with Review) and Settings live in it; the
// cards themselves are src/main/cards, the videos watched src/main/watchlog.
//
// IPC (the page reaches these through window.duet.home in src/preload/home.ts):
//   home:get-today     → HomeToday: the streak and the cards to review now
//   home:get-watching  → WatchingVideo[]: videos watched, the last first
//   home:open-video    opens a video from Watching in the browser where the learner left off
//   home:open-welcome  opens the welcome window again (Settings › permissions)
//   home:place         ← which place to show (opening Home on Cards, Settings…)
//   cards:show         ← a card to show in My cards
//   cards:changed      ← cards changed (saved, edited, reviewed), so the page reloads them
//   duet:settings      ← the settings changed (from anywhere), so Settings shows them
import type { EventEmitter } from 'events'
import { ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import type { HomePlace, HomeToday, WatchingVideo } from '../../shared/home'
import type { DueCounts, OverlaySettings } from '../../shared/types'
import { sourceForSite } from '../sources'
import type { WatchLog } from '../watchlog'
import { createHomeWindow } from '../windows/home'

// Watching shows this many videos.
const VIDEOS_SHOWN = 50

export class Home {
  private window?: BrowserWindow

  constructor({
    log,
    cards,
    settings,
    openWelcome
  }: {
    log: WatchLog
    cards: EventEmitter & { counts(): DueCounts }
    settings: EventEmitter
    openWelcome: () => void
  }) {
    ipcMain.handle('home:get-today', (): HomeToday => {
      const { due, newAvailable } = cards.counts()
      return { streak: log.streak(), due: due + newAvailable }
    })
    ipcMain.handle('home:get-watching', (): WatchingVideo[] =>
      log
        .recentVideos(VIDEOS_SHOWN)
        .map((video) => ({ ...video, siteName: sourceForSite(video.site)?.name ?? video.site }))
    )
    // Opening an address is the page's most powerful ask, so the page only names a video it was
    // shown; the address comes from the record.
    ipcMain.on('home:open-video', (event, key: unknown) => {
      if (!this.owns(event.sender) || typeof key !== 'string') return
      const video = log.video(key)
      const source = video && sourceForSite(video.site)
      if (video && source)
        void shell.openExternal(source.linkAt(video.videoId, video.position ?? 0))
    })
    ipcMain.on('home:open-welcome', (event) => {
      if (this.owns(event.sender)) openWelcome()
    })
    cards.on('changed', () => this.send('cards:changed'))
    settings.on('change', (current: OverlaySettings) => this.send('duet:settings', current))
  }

  /** Shows the home base on a place (Today by default), and on one card when given. */
  open(place: HomePlace = 'today', cardId?: string): void {
    if (!this.window || this.window.isDestroyed()) {
      const window = (this.window = createHomeWindow())
      window.on('closed', () => (this.window = undefined))
      window.webContents.once('did-finish-load', () => this.show(place, cardId))
      return
    }
    this.window.show()
    this.window.focus()
    this.show(place, cardId)
  }

  /** Whether a message came from the home page. */
  owns(sender: WebContents): boolean {
    return !!this.window && !this.window.isDestroyed() && sender === this.window.webContents
  }

  private show(place: HomePlace, cardId?: string): void {
    this.send('home:place', { place })
    if (cardId) this.send('cards:show', cardId)
  }

  private send(channel: string, value?: unknown): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, value)
  }
}
