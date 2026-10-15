// Updates' IPC (window.duet.updates in src/preload/updates.ts), for the home base's Settings:
//   updates:get      → UpdateStatus: this copy's version and where its updates stand
//   updates:check    looks for an update now
//   updates:restart  installs the downloaded update and opens Duet again
//   updates:changed  ← UpdateStatus, whenever it changes
import { ipcMain, type WebContents } from 'electron'
import type { Updates } from '.'

export function connectUpdates(
  updates: Updates,
  {
    owns,
    send
  }: { owns: (sender: WebContents) => boolean; send: (channel: string, value: unknown) => void }
): void {
  ipcMain.handle('updates:get', (event) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    return updates.status
  })
  ipcMain.on('updates:check', (event) => {
    if (owns(event.sender)) updates.check()
  })
  ipcMain.on('updates:restart', (event) => {
    if (owns(event.sender)) updates.restart()
  })
  updates.on('change', (status) => send('updates:changed', status))
}
