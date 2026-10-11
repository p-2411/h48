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
  /** Turns of a voice conversation that just ended, to keep in the thread. */
  voiceTurns: (turns: { from: 'learner' | 'duet'; text: string }[]) => ipcRenderer.send('explain:voice-turns', turns),
  /** Voice is about to start: the conversation is this line's again (the strip may have taken it). */
  claim: () => invoke<void>('explain:claim'),
  /** The learner's message in the text conversation about the line. */
  ask: (message: string) => ipcRenderer.send('explain:ask', message)
}
