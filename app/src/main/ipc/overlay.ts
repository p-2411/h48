// The overlay's IPC: what the overlay page can ask for, and what it is sent as things change.
// The page reaches these through window.duet in src/preload/overlay.ts.
//
//   duet:get-state     → { settings, status, due, fit }
//   duet:set-*         settings changes
//   duet:script        opens the side panel on the Script tab
//   duet:explain       explains a line (the one on screen when no id is given)
//   duet:save          stars a line, or one of its words (by pair) → SaveResult
//   duet:unsave        undoes a star (deletes that card)
//   duet:replay        goes back to a line in the video
//   duet:review        opens the side panel on Review
//   duet:play-on       plays the video that Wait is holding
//   duet:solid         the pointer is over Duet (take clicks) or not (let them through to the video)
//   duet:drag          the learner drags the subtitles: start, end (placement.ts moves the window)
//   duet:focus         takes the keyboard, while the learner presses new show/hide keys
//   duet:set-shortcut  new show/hide keys → why not, if they can't be had
//   duet:status / duet:settings / duet:line / duet:current / duet:live / duet:due   ← updates
//   duet:fit           ← how wide the strip may be, to stay inside the video (none: as wide as it likes)
import { ipcMain, type BrowserWindow } from 'electron'
import type { SaveResult } from '../../shared/cards'
import type { DueCounts, Language, Level, OverlaySettings } from '../../shared/types'
import type { Settings } from '../settings'
import type { Watcher } from '../watcher'

type Actions = {
  watcher: Watcher
  settings: Settings
  due: () => DueCounts
  explainLine: (lineId?: number) => void
  showScript: () => void
  saveLine: (lineId?: number, pair?: number) => SaveResult | undefined
  unsave: (cardId: string) => void
  replayLine: (lineId?: number) => void
  openReview: () => void
  playOn: () => void
  setShortcut: (keys: string) => string | undefined
  drag: (phase: 'start' | 'end') => void
  /** How wide the strip may be to stay inside the video, when one is in view. */
  fit: () => number | undefined
}

export function connectOverlay(
  overlay: BrowserWindow,
  actions: Actions
): { sendDue: (due: DueCounts) => void; sendFit: (maxWidth?: number) => void } {
  const { watcher, settings } = actions
  const send = (channel: string, payload: unknown): void => {
    if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload)
  }
  watcher.on('status', (status) => send('duet:status', status))
  watcher.on('line', (line) => send('duet:line', line))
  watcher.on('current', (id) => send('duet:current', id))
  watcher.on('live', (text) => send('duet:live', text))
  settings.on('change', (current) => send('duet:settings', current))

  ipcMain.handle('duet:get-state', () => ({ settings: settings.current, status: watcher.status, due: actions.due(), fit: actions.fit() ?? null }))
  ipcMain.on('duet:set-language', (_, language: Language) => settings.update({ language }))
  ipcMain.on('duet:set-level', (_, level: Level) => settings.update({ level }))
  ipcMain.on('duet:set-guess-first', (_, guessFirst: boolean) => settings.update({ guessFirst }))
  ipcMain.on('duet:set-wait', (_, waitForTranslation: boolean) => settings.update({ waitForTranslation }))
  ipcMain.on('duet:set', (_, change: Partial<Pick<OverlaySettings, 'pauseForHelp'>>) =>
    settings.update({ pauseForHelp: change.pauseForHelp })
  )
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
  ipcMain.handle('duet:set-shortcut', (_, keys: string) => actions.setShortcut(String(keys)))
  ipcMain.on('duet:focus', () => overlay.isDestroyed() || overlay.focus())
  ipcMain.on('duet:drag', (_, phase: 'start' | 'end') => actions.drag(phase === 'start' ? 'start' : 'end'))
  return { sendDue: (due) => send('duet:due', due), sendFit: (maxWidth) => send('duet:fit', maxWidth ?? null) }
}
