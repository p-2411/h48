// The home base's bridge to the main process (src/main/home).
import { ipcRenderer } from 'electron'
import type { HomePlace, HomeToday, WatchingVideo } from '../shared/home'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const homeApi = {
  getToday: () => invoke<HomeToday>('home:get-today'),
  getWatching: () => invoke<WatchingVideo[]>('home:get-watching'),
  /** Opens a video from Watching in the browser, where the learner left off. */
  openVideo: (key: string) => ipcRenderer.send('home:open-video', key),
  /** Opens the welcome window again, for the permissions. */
  openWelcome: () => ipcRenderer.send('home:open-welcome'),
  /** Main asks for a place (Home opened on Cards, Settings…). */
  onPlace: (listener: (message: { place: HomePlace }) => void) => subscribe('home:place', listener)
}
