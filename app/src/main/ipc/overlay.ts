// The overlay's IPC: what the overlay page can ask for, and what it is sent as things change.
// The page reaches these through window.duet in src/preload/overlay.ts.
//
//   duet:get-state     → { settings, status }
//   duet:set-*         settings changes
//   duet:script        opens the side panel on the Script tab
//   duet:explain       explains a line (the one on screen when no id is given)
//   duet:open-tutor    opens the tutor on a line (the one on screen when no id is given)
//   duet:hide          hides the overlay
//   duet:status / duet:settings / duet:line / duet:current / duet:live   ← updates
import { ipcMain, type BrowserWindow } from 'electron'
import type { Language, Level } from '../../shared/types'
import type { Settings } from '../settings'
import type { Watcher } from '../watcher'

export function connectOverlay(
  overlay: BrowserWindow,
  {
    watcher,
    settings,
    openTutor,
    explainLine,
    showScript
  }: {
    watcher: Watcher
    settings: Settings
    openTutor: (lineId?: number) => void
    explainLine: (lineId?: number) => void
    showScript: () => void
  }
): void {
  const send = (channel: string, payload: unknown): void => {
    if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload)
  }
  watcher.on('status', (status) => send('duet:status', status))
  watcher.on('line', (line) => send('duet:line', line))
  watcher.on('current', (id) => send('duet:current', id))
  watcher.on('live', (text) => send('duet:live', text))
  settings.on('change', (current) => send('duet:settings', current))

  ipcMain.handle('duet:get-state', () => ({ settings: settings.current, status: watcher.status }))
  ipcMain.on('duet:set-language', (_, language: Language) => settings.update({ language }))
  ipcMain.on('duet:set-level', (_, level: Level) => settings.update({ level }))
  ipcMain.on('duet:set-guess-first', (_, guessFirst: boolean) => settings.update({ guessFirst }))
  ipcMain.on('duet:set-wait', (_, waitForTranslation: boolean) => settings.update({ waitForTranslation }))
  ipcMain.on('duet:open-tutor', (_, lineId?: number) => openTutor(lineId))
  ipcMain.on('duet:explain', (_, lineId?: number) => explainLine(lineId))
  ipcMain.on('duet:script', () => showScript())
  ipcMain.on('duet:hide', () => overlay.hide())
}
