// The conversation's bridge to the main process (src/main/tutor), used by the side panel's Explain
// tab for voice, card previews and the learning tools. All on "tutor:*" channels; main answers only
// the side panel.
import { ipcRenderer } from 'electron'
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
  /** Unlocks saved-card/history tools only after the learner explicitly asks to explore. */
  setExplore: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('tutor:set-explore', enabled),
  /** Starts voice on the line Explain is open on; the video waits until voiceEnded. */
  startSession: (offer: TutorSessionOffer): Promise<TutorSessionAnswer> =>
    ipcRenderer.invoke('tutor:start-session', offer),
  voiceEnded: () => ipcRenderer.send('tutor:voice-ended'),
  /** The English meaning of one of Duet's turns in the language learnt; the voice never speaks it. */
  translate: (text: string): Promise<string> => ipcRenderer.invoke('tutor:translate', text),
  /** A turn written in Latin letters (Hepburn, Revised Romanization), for languages not written in them. */
  romanise: (text: string): Promise<string> => ipcRenderer.invoke('tutor:romanise', text),
  executeTool: (request: TutorToolRequest): Promise<TutorToolResult> =>
    ipcRenderer.invoke('tutor:execute-tool', request),
  confirmAction: (actionId: string, rating?: ReviewRating): Promise<TutorActionResult> =>
    ipcRenderer.invoke('tutor:confirm-action', actionId, rating),
  undo: (): Promise<TutorActionResult> => ipcRenderer.invoke('tutor:undo'),
  /** Call on each finished learner transcript. Only a learner turn after a preview lets the voice
   * model commit that save or rating; the model's own turns never count. */
  learnerTurn: () => ipcRenderer.send('tutor:learner-turn'),
  onCard: (listener: (card: TutorCard) => void) => subscribe('tutor:card', listener),
  onPendingAction: (listener: (action: PendingTutorAction) => void) =>
    subscribe('tutor:pending-action', listener),
  onActionResult: (listener: (result: TutorActionResult) => void) =>
    subscribe('tutor:action-result', listener)
}
