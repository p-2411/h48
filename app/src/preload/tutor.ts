// The tutor page's bridge to the main process (src/main/tutor). Add the tutor's calls here, all on
// "tutor:*" channels.
import { ipcRenderer } from 'electron'
import type { Moment } from '../shared/moment'
import type {
  PendingTutorAction,
  ReviewRating,
  TutorActionResult,
  TutorCard,
  TutorSessionAnswer,
  TutorSessionOffer,
  TutorToolRequest,
  TutorToolResult
} from '../shared/tutor'
import { subscribe } from './subscribe'

export const tutorApi = {
  /** The moment the tutor was opened on. */
  getMoment: (): Promise<Moment | undefined> => ipcRenderer.invoke('tutor:get-moment'),
  getAutoStart: (): Promise<boolean> => ipcRenderer.invoke('tutor:get-auto-start'),
  /** The tutor was opened again on another moment. */
  onMoment: (listener: (moment: Moment) => void) => subscribe('tutor:moment', listener),
  onAutoStart: (listener: (autoStart: boolean) => void) => subscribe('tutor:auto-start', listener),
  /** Unlocks saved-card/history tools only after the learner explicitly asks to explore. */
  setExplore: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('tutor:set-explore', enabled),
  startSession: (offer: TutorSessionOffer): Promise<TutorSessionAnswer> =>
    ipcRenderer.invoke('tutor:start-session', offer),
  /** A visual English aid for a Japanese turn; GPT-Live does not speak this automatically. */
  translate: (text: string): Promise<string> => ipcRenderer.invoke('tutor:translate', text),
  /** Silent Hepburn reading shown below Japanese transcript text. */
  pronounce: (text: string): Promise<string> => ipcRenderer.invoke('tutor:pronounce', text),
  executeTool: (request: TutorToolRequest): Promise<TutorToolResult> =>
    ipcRenderer.invoke('tutor:execute-tool', request),
  confirmAction: (actionId: string, rating?: ReviewRating): Promise<TutorActionResult> =>
    ipcRenderer.invoke('tutor:confirm-action', actionId, rating),
  undo: (): Promise<TutorActionResult> => ipcRenderer.invoke('tutor:undo'),
  onCard: (listener: (card: TutorCard) => void) => subscribe('tutor:card', listener),
  onPendingAction: (listener: (action: PendingTutorAction) => void) =>
    subscribe('tutor:pending-action', listener),
  onActionResult: (listener: (result: TutorActionResult) => void) =>
    subscribe('tutor:action-result', listener),
  close: () => ipcRenderer.send('tutor:close')
}
