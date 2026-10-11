// The overlay page's bridge to the main process (src/main/ipc/overlay.ts): read state, follow
// updates, change settings.
import { ipcRenderer } from 'electron'
import type { SaveResult } from '../shared/cards'
import type {
  DueCounts,
  Language,
  Level,
  OverlayLine,
  OverlaySettings,
  OverlayStatus
} from '../shared/types'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const overlayApi = {
  getState: () =>
    invoke<{
      settings: OverlaySettings
      status: OverlayStatus
      due: DueCounts
      fit: number | null
    }>('duet:get-state'),
  /** Cards ready to review, whenever that changes. */
  onDue: (listener: (due: DueCounts) => void) => subscribe('duet:due', listener),
  onStatus: (listener: (status: OverlayStatus) => void) => subscribe('duet:status', listener),
  /** How wide the strip may be to stay inside the video; null when it can be as wide as it likes. */
  onFit: (listener: (maxWidth: number | null) => void) => subscribe('duet:fit', listener),
  onSettings: (listener: (settings: OverlaySettings) => void) =>
    subscribe('duet:settings', listener),
  /** The caption text on screen right now, before the line has finished. */
  onLive: (listener: (text: string) => void) => subscribe('duet:live', listener),
  onLine: (listener: (line: OverlayLine) => void) => subscribe('duet:line', listener),
  /** The id of the line that belongs on screen now, or null for none. */
  onCurrent: (listener: (id: number | null) => void) => subscribe('duet:current', listener),
  setLanguage: (language: Language) => ipcRenderer.send('duet:set-language', language),
  setLevel: (level: Level) => ipcRenderer.send('duet:set-level', level),
  setGuessFirst: (on: boolean) => ipcRenderer.send('duet:set-guess-first', on),
  setWaitForTranslation: (on: boolean) => ipcRenderer.send('duet:set-wait', on),
  setCheckpoints: (on: boolean) => ipcRenderer.send('duet:set-checkpoints', on),
  setPauseForHelp: (on: boolean) => ipcRenderer.send('duet:set', { pauseForHelp: on }),
  /** Stars a line (the one on screen when no id is given), or one of its words by pair number. */
  save: (lineId?: number, pair?: number) =>
    invoke<SaveResult | undefined>('duet:save', lineId, pair),
  /** Takes a star back: deletes the card it made. */
  unsave: (cardId: string) => ipcRenderer.send('duet:unsave', cardId),
  /** Goes back to a line in the video (the one on screen when no id is given). */
  replay: (lineId?: number) => ipcRenderer.send('duet:replay', lineId),
  /** The pointer rested on a word of a line (for the watch log). */
  hoveredWord: (lineId: number, text: string) =>
    ipcRenderer.send('duet:hovered-word', lineId, text),
  /** Plays the video Wait is holding for a line. */
  playOn: () => ipcRenderer.send('duet:play-on'),
  /** Whether the pointer is over something of Duet's (take clicks) or not (let them through). */
  setSolid: (solid: boolean) => ipcRenderer.send('duet:solid', solid),
  /** Dragging the subtitles: the window follows the pointer between start and end. */
  drag: (phase: 'start' | 'end') => ipcRenderer.send('duet:drag', phase),
  /** Takes the keyboard (the overlay normally leaves it to the video), to record new keys. */
  focus: () => ipcRenderer.send('duet:focus'),
  /** New show/hide keys (an Electron accelerator); resolves with why not, if they can't be had. */
  setShortcut: (keys: string) => invoke<string | undefined>('duet:set-shortcut', keys),
  /** Opens the home base's Settings. */
  openSettings: () => ipcRenderer.send('duet:open-settings'),
  /** Opens the side panel on the Script tab. */
  showScript: () => ipcRenderer.send('duet:script'),
  /** Explains a line; the line on screen when no id is given. */
  explainLine: (lineId?: number) => ipcRenderer.send('duet:explain', lineId)
}
