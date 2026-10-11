// The overlay page's bridge to the main process (src/main/ipc/overlay.ts): read state, follow
// updates, change settings.
import { ipcRenderer } from 'electron'
import type { Language, Level, OverlayLine, OverlaySettings, OverlayStatus } from '../shared/types'
import { subscribe } from './subscribe'

export const overlayApi = {
  getState: (): Promise<{ settings: OverlaySettings; status: OverlayStatus }> => ipcRenderer.invoke('duet:get-state'),
  onStatus: (listener: (status: OverlayStatus) => void) => subscribe('duet:status', listener),
  onSettings: (listener: (settings: OverlaySettings) => void) => subscribe('duet:settings', listener),
  /** The caption text on screen right now, before the line has finished. */
  onLive: (listener: (text: string) => void) => subscribe('duet:live', listener),
  onLine: (listener: (line: OverlayLine) => void) => subscribe('duet:line', listener),
  /** The id of the line that belongs on screen now, or null for none. */
  onCurrent: (listener: (id: number | null) => void) => subscribe('duet:current', listener),
  setLanguage: (language: Language) => ipcRenderer.send('duet:set-language', language),
  setLevel: (level: Level) => ipcRenderer.send('duet:set-level', level),
  setGuessFirst: (on: boolean) => ipcRenderer.send('duet:set-guess-first', on),
  setWaitForTranslation: (on: boolean) => ipcRenderer.send('duet:set-wait', on),
  /** Explains a line; the line on screen when no id is given. */
  explainLine: (lineId?: number) => ipcRenderer.send('duet:explain', lineId),
  /** Opens the voice tutor on a line; the line on screen when no id is given. */
  openTutor: (lineId?: number) => ipcRenderer.send('duet:open-tutor', lineId),
  hide: () => ipcRenderer.send('duet:hide')
}
