// The home base's bridge to the main process (src/main/home).
import { ipcRenderer } from 'electron'
import type { HomePlace, HomeToday, WatchingVideo } from '../shared/home'
import { invoke } from './invoke'
import { subscribe } from './subscribe'
import type { HomeView, HomePreferences } from '../shared/workspace'

export const homeApi = {
  getView: () => invoke<HomeView>('home:get-view'),
  setView: (change: Partial<HomePreferences>) => invoke<HomeView>('home:set-view', change),
  onView: (listener: (view: HomeView) => void) => subscribe('home:view', listener),
  getToday: () => invoke<HomeToday>('home:get-today'),
  getWatching: () => invoke<WatchingVideo[]>('home:get-watching'),
  /** Opens a video from Watching in the browser, where the learner left off. */
  openVideo: (key: string) => invoke<void>('home:open-video', key),
  /** Replays the welcome window as a demo (Settings › Demo); it saves no choices. */
  openWelcome: () => ipcRenderer.send('home:open-welcome'),
  /** Main asks for a place (Home opened on Cards, Settings…). */
  onPlace: (listener: (message: { place: HomePlace }) => void) => subscribe('home:place', listener)
}
