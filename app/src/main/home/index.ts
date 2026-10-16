// The home base, main-process side: its window (opened from the Dock, the menu bar and at launch)
// and what its page asks for. Today, Talk, Watching, Words and cards (with Review), and Settings live
// in it; the cards themselves are src/main/cards, the videos watched src/main/watchlog.
//
// IPC (the page reaches these through window.duet.home in src/preload/home.ts):
//   home:get-today     → HomeToday: the streak, this week's days and the cards to review now
//   home:get-watching  → WatchingVideo[]: videos watched, the last first
//   home:open-video    opens a video from Watching in the browser where the learner left off (or
//                      says why it can't)
//   home:open-welcome  replays the welcome window as a demo (Settings › Demo)
//   home:place         ← which place to show (opening Home on Your words, Settings…)
//   cards:show         ← a card to show in My cards
//   cards:changed      ← cards changed (saved, edited, reviewed), so the page reloads them
//   duet:settings      ← the settings changed (from anywhere), so Settings shows them
import type { EventEmitter } from 'events'
import {
  ipcMain,
  shell,
  nativeTheme,
  systemPreferences,
  type BrowserWindow,
  type WebContents
} from 'electron'
import type { HomePlace, HomeToday, WatchingVideo } from '../../shared/home'
import { reviewableNow, type DueCounts, type OverlaySettings } from '../../shared/types'
import { sourceForSite } from '../sources'
import type { WatchLog } from '../watchlog'
import { isFrom } from '../windows/from'
import { createHomeWindow } from '../windows/home'
import {
  cleanLayout,
  type Appearance,
  type HomePreferences,
  type HomeView
} from '../../shared/workspace'
import { readSetting, writeSetting } from '../store/db'
import type { Knowledge } from '../knowledge'
import { todayWord, videoLearning } from './data'

// Watching shows this many videos.
const VIDEOS_SHOWN = 50

export class Home {
  private window?: BrowserWindow
  // The place to show once the page has loaded (it can't hear one before).
  private pending?: { place?: HomePlace; cardId?: string }
  private preferences: HomePreferences = { appearance: 'light', layout: cleanLayout(undefined) }
  private view(): HomeView {
    const systemDark =
      process.platform === 'darwin'
        ? systemPreferences.getUserDefault('AppleInterfaceStyle', 'string') === 'Dark'
        : (nativeTheme?.shouldUseDarkColorsForSystemIntegratedUI ?? false)
    return {
      ...this.preferences,
      dark:
        this.preferences.appearance === 'dark' ||
        (this.preferences.appearance === 'system' && systemDark),
      platform: process.platform
    }
  }
  private paintWindow(): void {
    if (!this.window || this.window.isDestroyed()) return
    const { dark } = this.view()
    this.window.setBackgroundColor(dark ? '#121313' : '#f2f3f3')
    if (process.platform === 'win32')
      this.window.setTitleBarOverlay({
        height: 48,
        color: dark ? '#121313' : '#f2f3f3',
        symbolColor: dark ? '#eef3f1' : '#1b201f'
      })
  }

  constructor({
    log,
    cards,
    settings,
    knowledge,
    openWelcome
  }: {
    log: WatchLog
    cards: EventEmitter & { counts(): DueCounts }
    settings: EventEmitter & { current?: OverlaySettings }
    knowledge?: Knowledge
    openWelcome: () => void
  }) {
    const saved = readSetting<Partial<HomePreferences>>('home-v2')
    this.preferences = {
      appearance: ['light', 'dark', 'system'].includes(saved?.appearance ?? '')
        ? saved!.appearance!
        : 'light',
      layout: cleanLayout(saved?.layout)
    }
    const handle = (channel: string, work: (...args: unknown[]) => unknown): void => {
      ipcMain.handle(channel, (event, ...args) => {
        if (!this.owns(event.sender)) throw new Error('Not allowed: this is the home page’s.')
        return work(...args)
      })
    }
    handle('home:get-view', () => this.view())
    handle('home:set-view', (change: unknown) => {
      if (!change || typeof change !== 'object') throw new Error('Invalid home preferences')
      const value = change as Partial<HomePreferences>
      if (value.appearance !== undefined) {
        if (!['light', 'dark', 'system'].includes(value.appearance))
          throw new Error('Invalid appearance')
        this.preferences.appearance = value.appearance as Appearance
      }
      if (value.layout !== undefined) this.preferences.layout = cleanLayout(value.layout)
      writeSetting('home-v2', this.preferences)
      this.paintWindow()
      const view = this.view()
      this.send('home:view', view)
      this.emitLook()
      return view
    })
    nativeTheme?.on('updated', () => {
      this.paintWindow()
      this.send('home:view', this.view())
      this.emitLook()
    })
    handle('home:get-today', (): HomeToday => {
      return {
        streak: log.streak(),
        week: log.week(),
        hasWatched: log.recentVideos(1).length > 0,
        due: reviewableNow(cards.counts()),
        ...(knowledge && settings.current
          ? { word: todayWord(settings.current.language, knowledge) }
          : {})
      }
    })
    handle('home:get-watching', (): WatchingVideo[] =>
      log.recentVideos(VIDEOS_SHOWN).map((video) => {
        const summary = { ...video, siteName: sourceForSite(video.site)?.name ?? video.site }
        return knowledge && settings.current
          ? videoLearning(summary, settings.current.language, knowledge)
          : summary
      })
    )
    // Opening an address is the page's most powerful ask, so the page only names a video it was
    // shown; the address comes from the record.
    handle('home:open-video', async (key: unknown) => {
      const video = typeof key === 'string' ? log.video(key) : undefined
      const source = video && sourceForSite(video.site)
      if (!video || !source)
        throw new Error('Could not open that video. It may no longer be on record.')
      await shell.openExternal(source.linkAt(video.videoId, video.position ?? 0))
    })
    ipcMain.on('home:open-welcome', (event) => {
      if (this.owns(event.sender)) openWelcome()
    })
    cards.on('changed', () => this.send('cards:changed'))
    settings.on('change', (current: OverlaySettings) => this.send('duet:settings', current))
  }

  /** Shows the home base: on the hub as it was left, or on a place when given (it grows out of its
   * tile), and on one card when given. */
  open(place?: HomePlace, cardId?: string): void {
    if (!this.window || this.window.isDestroyed()) {
      const window = (this.window = createHomeWindow(this.view().dark))
      this.pending = { place, cardId }
      window.on('closed', () => {
        this.window = undefined
        this.pending = undefined
      })
      window.webContents.once('did-finish-load', () => {
        const pending = this.pending
        this.pending = undefined
        if (pending) this.show(pending.place, pending.cardId)
      })
      return
    }
    this.window.show()
    this.window.focus()
    if (this.pending)
      this.pending = { place: place ?? this.pending.place, cardId: cardId ?? this.pending.cardId }
    else this.show(place, cardId)
  }

  /** Whether Duet is drawn dark (the home base's look): the side panel follows it. */
  get dark(): boolean {
    return this.view().dark
  }
  /** Calls `listener` whenever the look may have changed (the learner's choice, or the system's). */
  onLook(listener: (dark: boolean) => void): void {
    this.lookListeners.push(listener)
  }
  private lookListeners: ((dark: boolean) => void)[] = []
  private emitLook(): void {
    const { dark } = this.view()
    for (const listener of this.lookListeners) listener(dark)
  }

  /** Whether a message came from the home page. */
  owns(sender: WebContents): boolean {
    return isFrom(this.window, sender)
  }

  private show(place?: HomePlace, cardId?: string): void {
    if (place) this.send('home:place', { place })
    if (cardId) this.send('cards:show', cardId)
  }

  /** Sends to the home page, when the window is open (it is also Talk's window: src/main/talk). */
  send(channel: string, value?: unknown): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, value)
  }
}

/** What opens when Duet starts or its Dock icon is clicked: the welcome window until the learner
 * has been through it, then the home base. */
export function openDuet({
  onboarded,
  home,
  welcome
}: {
  onboarded: boolean
  home: { open(): void }
  welcome: { open(): void }
}): void {
  if (onboarded) home.open()
  else welcome.open()
}
