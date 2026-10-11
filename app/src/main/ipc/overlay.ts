// The overlay's IPC: what the overlay page can ask for, and what it is sent as things change.
// The page reaches these through window.duet in src/preload/overlay.ts.
//
//   duet:get-state     → { settings, status, fit }
//   duet:set-*         settings changes; duet:set takes a few at once (settings-change.ts)
//   duet:script        opens the side panel on the Script tab
//   duet:open-settings opens the home base's Settings
//   duet:explain       explains a line (the one on screen when no id is given)
//   duet:save          stars a line, or one of its words (by pair) → SaveResult
//   duet:unsave        undoes a star (deletes that card)
//   duet:replay        goes back to a line in the video
//   duet:hovered-word  the pointer rested on a word of a line (the watch log notes it)
//   duet:play-on       plays the video that Wait is holding
//   duet:solid         the pointer is over Duet (take clicks) or not (let them through to the video)
//   duet:drag          the learner drags the subtitles: start, end (placement.ts moves the window)
//   duet:focus         takes the keyboard, while the learner types an answer in a checkpoint
//   duet:menu          the strip was right-clicked: Hide Duet, Settings…, Quit Duet
//   duet:set-shortcut  new keys, to show or hide Duet or to talk to it → why not, if they can't be had
//   duet:set-reminder  the daily reminder's time ("19:30"), or null for none; anything else is refused
//   duet:status / duet:settings / duet:line / duet:current / duet:live   ← updates
//   duet:fit           ← how wide the strip may be, to stay inside the video (none: as wide as it likes)
import { app, ipcMain, Menu, type BrowserWindow } from 'electron'
import type { SaveResult } from '../../shared/cards'
import type { Language, Level, ShortcutKind } from '../../shared/types'
import { parseReminder } from '../daily/reminder'
import { settingsChange } from './settings-change'
import type { Settings } from '../settings'
import type { Watcher } from '../watcher'

type Actions = {
  watcher: Watcher
  settings: Settings
  explainLine: (lineId?: number) => void
  showScript: () => void
  saveLine: (lineId?: number, pair?: number) => SaveResult | undefined
  unsave: (cardId: string) => void
  replayLine: (lineId?: number) => void
  openSettings: () => void
  hoveredWord: (lineId: number, text: string) => void
  playOn: () => void
  setShortcut: (keys: string, kind: ShortcutKind) => string | undefined
  drag: (phase: 'start' | 'end') => void
  /** How wide the strip may be to stay inside the video, when one is in view. */
  fit: () => number | undefined
}

export function connectOverlay(
  overlay: BrowserWindow,
  actions: Actions
): { sendFit: (maxWidth?: number) => void } {
  const { watcher, settings } = actions
  const send = (channel: string, payload: unknown): void => {
    if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload)
  }
  watcher.on('status', (status) => send('duet:status', status))
  watcher.on('line', (line) => send('duet:line', line))
  watcher.on('current', (id) => send('duet:current', id))
  watcher.on('live', (text) => send('duet:live', text))
  settings.on('change', (current) => send('duet:settings', current))

  ipcMain.handle('duet:get-state', () => ({
    settings: settings.current,
    status: watcher.status,
    fit: actions.fit() ?? null
  }))
  ipcMain.on('duet:set-language', (_, language: Language) => settings.update({ language }))
  ipcMain.on('duet:set-level', (_, level: Level) => settings.update({ level }))
  ipcMain.on('duet:set-guess-first', (_, guessFirst: boolean) => settings.update({ guessFirst }))
  ipcMain.on('duet:set-wait', (_, waitForTranslation: boolean) =>
    settings.update({ waitForTranslation })
  )
  ipcMain.on('duet:set-checkpoints', (_, checkpoints: unknown) => {
    if (typeof checkpoints === 'boolean') settings.update({ checkpoints })
  })
  ipcMain.handle('duet:set-reminder', (_, time: unknown) => {
    const reminder = parseReminder(time)
    if (time !== null && !reminder) throw new Error('Pick a time for the reminder, like 19:30.')
    settings.update({ reminder })
  })
  ipcMain.on('duet:set', (_, change: unknown) => {
    const kept = settingsChange(change)
    if (Object.keys(kept).length) settings.update(kept)
  })
  ipcMain.on('duet:explain', (_, lineId?: number) => actions.explainLine(lineId))
  ipcMain.on('duet:script', () => actions.showScript())
  ipcMain.on('duet:open-settings', () => actions.openSettings())
  ipcMain.handle('duet:save', (_, lineId?: number, pair?: number) => actions.saveLine(lineId, pair))
  ipcMain.on('duet:unsave', (_, cardId: string) => actions.unsave(cardId))
  ipcMain.on('duet:replay', (_, lineId?: number) => actions.replayLine(lineId))
  // From the page, so untrusted: hoveredWord checks the line and the word itself.
  ipcMain.on('duet:hovered-word', (_, lineId: number, text: string) =>
    actions.hoveredWord(lineId, text)
  )
  ipcMain.on('duet:play-on', () => actions.playOn())
  // The window lets clicks through to the video except where Duet is drawn (see windows/overlay.ts).
  ipcMain.on('duet:solid', (_, solid: boolean) => {
    if (!overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!solid, { forward: true })
  })
  ipcMain.handle('duet:set-shortcut', (_, keys: unknown, kind: unknown) => actions.setShortcut(String(keys), kind === 'talk' ? 'talk' : 'show'))
  ipcMain.on('duet:focus', () => overlay.isDestroyed() || overlay.focus())
  ipcMain.on('duet:menu', (event) => {
    if (overlay.isDestroyed() || event.sender !== overlay.webContents) return
    Menu.buildFromTemplate([
      { label: 'Hide Duet', click: () => overlay.isDestroyed() || overlay.hide() },
      { label: 'Settings…', click: () => actions.openSettings() },
      { type: 'separator' },
      { label: 'Quit Duet', click: () => app.quit() }
    ]).popup({ window: overlay })
  })
  ipcMain.on('duet:drag', (_, phase: 'start' | 'end') =>
    actions.drag(phase === 'start' ? 'start' : 'end')
  )
  return {
    sendFit: (maxWidth) => send('duet:fit', maxWidth ?? null)
  }
}
