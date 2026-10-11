// The Explain tab's bridge to the main process (src/main/explain).
import { ipcRenderer } from 'electron'
import type { ExplainState } from '../shared/explain'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const explainApi = {
  getState: () => invoke<ExplainState>('explain:get-state'),
  onState: (listener: (state: ExplainState) => void) => subscribe('explain:state', listener),
  retry: () => ipcRenderer.send('explain:retry'),
  replay: () => ipcRenderer.send('explain:replay'),
  /** Opens the voice tutor on the line being explained. */
  converse: () => ipcRenderer.send('explain:converse'),
  /** A follow-up question about the line. */
  ask: (question: string) => ipcRenderer.send('explain:ask', question)
}
