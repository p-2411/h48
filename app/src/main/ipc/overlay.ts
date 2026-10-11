// The overlay's IPC: what the overlay page can ask for, and what it is sent as things change.
// The page reaches these through window.duet in src/preload/overlay.ts.
//
//   duet:get-state     → { settings, status, due }
//   duet:set-*         settings changes
//   duet:script        opens the side panel on the Script tab
//   duet:explain       explains a line (the one on screen when no id is given)
//   duet:save          stars a line, or one of its words (by pair) → SaveResult
//   duet:unsave        undoes a star (deletes that card)
//   duet:replay        goes back to a line in the video
//   duet:review        opens the side panel on Review
//   duet:play-on       plays the video that Wait is holding
//   duet:solid         the pointer is over Duet (take clicks) or not (let them through to the video)
//   duet:open-tutor    opens the tutor on a line (the one on screen when no id is given)
//   duet:hide          hides the overlay
//   duet:status / duet:settings / duet:line / duet:current / duet:live / duet:due   ← updates
import { ipcMain, type BrowserWindow } from 'electron'
import type { SaveResult } from '../../shared/cards'
import type { DueCounts, Language, Level, OverlaySettings } from '../../shared/types'
import type { Settings } from '../settings'
import type { Watcher } from '../watcher'

type Actions = {
  watcher: Watcher
  settings: Settings
  due: () => DueCounts
  openTutor: (lineId?: number) => void
  explainLine: (lineId?: number) => void
  showScript: () => void
  saveLine: (lineId?: number, pair?: number) => SaveResult | undefined
  unsave: (cardId: string) => void
  replayLine: (lineId?: number) => void
  openReview: () => void
  playOn: () => void
}

export function connectOverlay(overlay: BrowserWindow, actions: Actions): { sendDue: (due: DueCounts) => void } {
  const { watcher, settings } = actions
  const send = (channel: string, payload: unknown): void => {
    if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload)
  }
  watcher.on('status', (status) => send('duet:status', status))
  watcher.on('line', (line) => send('duet:line', line))
  watcher.on('current', (id) => send('duet:current', id))
  watcher.on('live', (text) => send('duet:live', text))
  settings.on('change', (current) => send('duet:settings', current))

  ipcMain.handle('duet:get-state', () => ({ settings: settings.current, status: watcher.status, due: actions.due() }))
  ipcMain.on('duet:set-language', (_, language: Language) => settings.update({ language }))
  ipcMain.on('duet:set-level', (_, level: Level) => settings.update({ level }))
  ipcMain.on('duet:set-guess-first', (_, guessFirst: boolean) => settings.update({ guessFirst }))
  ipcMain.on('duet:set-wait', (_, waitForTranslation: boolean) => settings.update({ waitForTranslation }))
  ipcMain.on('duet:set', (_, change: Partial<Pick<OverlaySettings, 'pauseForHelp'>>) =>
    settings.update({ pauseForHelp: change.pauseForHelp })
  )
  ipcMain.on('duet:open-tutor', (_, lineId?: number) => actions.openTutor(lineId))
  ipcMain.on('duet:explain', (_, lineId?: number) => actions.explainLine(lineId))
  ipcMain.on('duet:script', () => actions.showScript())
  ipcMain.handle('duet:save', (_, lineId?: number, pair?: number) => actions.saveLine(lineId, pair))
  ipcMain.on('duet:unsave', (_, cardId: string) => actions.unsave(cardId))
  ipcMain.on('duet:replay', (_, lineId?: number) => actions.replayLine(lineId))
  ipcMain.on('duet:review', () => actions.openReview())
  ipcMain.on('duet:play-on', () => actions.playOn())
  // The window lets clicks through to the video except where Duet is drawn (see windows/overlay.ts).
  ipcMain.on('duet:solid', (_, solid: boolean) => {
    if (!overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!solid, { forward: true })
  })
  ipcMain.on('duet:hide', () => overlay.hide())
  return { sendDue: (due) => send('duet:due', due) }
}
