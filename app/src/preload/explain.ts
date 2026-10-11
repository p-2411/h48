// The Explain page's bridge to the main process (src/main/explain).
import { ipcRenderer } from 'electron'
import type { ExplainState } from '../shared/explain'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const explainApi = {
  getState: () => invoke<ExplainState>('explain:get-state'),
  onState: (listener: (state: ExplainState) => void) => subscribe('explain:state', listener),
  retry: () => ipcRenderer.send('explain:retry'),
  replay: () => ipcRenderer.send('explain:replay'),
  close: () => ipcRenderer.send('explain:close')
}
