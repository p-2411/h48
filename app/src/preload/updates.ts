// Duet's own updates (src/main/updates), for Settings in the home base.
import { ipcRenderer } from 'electron'
import type { UpdateStatus } from '../shared/updates'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const updatesApi = {
  /** This copy's version, and where its updates stand. */
  get: () => invoke<UpdateStatus>('updates:get'),
  /** Looks for an update now. */
  check: () => ipcRenderer.send('updates:check'),
  /** Installs the downloaded update and opens Duet again. */
  restart: () => ipcRenderer.send('updates:restart'),
  onChanged: (listener: (status: UpdateStatus) => void) => subscribe('updates:changed', listener)
}
