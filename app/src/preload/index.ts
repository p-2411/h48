// The overlay's only bridge to the main process: read state, follow updates, change settings.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Language, Level, OverlayLine, OverlaySettings, OverlayStatus } from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const duet = {
  getState: (): Promise<{ settings: OverlaySettings; status: OverlayStatus }> => ipcRenderer.invoke('duet:get-state'),
  onStatus: (listener: (status: OverlayStatus) => void) => subscribe('duet:status', listener),
  onSettings: (listener: (settings: OverlaySettings) => void) => subscribe('duet:settings', listener),
  /** The caption text on screen right now, before the line has finished. */
  onLive: (listener: (text: string) => void) => subscribe('duet:live', listener),
  onLine: (listener: (line: OverlayLine) => void) => subscribe('duet:line', listener),
  setLanguage: (language: Language) => ipcRenderer.send('duet:set-language', language),
  setLevel: (level: Level) => ipcRenderer.send('duet:set-level', level),
  setGuessFirst: (on: boolean) => ipcRenderer.send('duet:set-guess-first', on),
  hide: () => ipcRenderer.send('duet:hide')
}

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)
