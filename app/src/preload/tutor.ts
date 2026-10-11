// The conversation's bridge to the main process (src/main/tutor): voice, card previews and the
// learning tools, for Explain (side panel), Talk (home base) and the strip's talk. All on "tutor:*"
// channels; main answers only the window whose conversation it is.
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
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const tutorApi = {
  /** Unlocks saved-card/history tools only after the learner explicitly asks to explore. */
  setExplore: (enabled: boolean): Promise<boolean> =>
    invoke<boolean>('tutor:set-explore', enabled),
  /** Starts voice in this window's conversation (a line, or free); the video waits until voiceEnded. */
  startSession: (offer: TutorSessionOffer): Promise<TutorSessionAnswer> =>
    invoke<TutorSessionAnswer>('tutor:start-session', offer),
  voiceEnded: () => ipcRenderer.send('tutor:voice-ended'),
  /** The English meaning of one of Duet's turns in the language learnt; the voice never speaks it. */
  translate: (text: string): Promise<string> =>
    invoke<string>('tutor:translate', text),
  /** A turn written in Latin letters (Hepburn, Revised Romanization), for languages not written in them. */
  romanise: (text: string): Promise<string> =>
    invoke<string>('tutor:romanise', text),
  executeTool: (request: TutorToolRequest): Promise<TutorToolResult> =>
    invoke<TutorToolResult>('tutor:execute-tool', request),
  confirmAction: (actionId: string, rating?: ReviewRating): Promise<TutorActionResult> =>
    invoke<TutorActionResult>('tutor:confirm-action', actionId, rating),
  undo: (): Promise<TutorActionResult> =>
    invoke<TutorActionResult>('tutor:undo'),
  /** Call on each finished learner transcript. Only a learner turn after a preview lets the voice
   * model commit that save or rating; the model's own turns never count. */
  /** The learner began a turn; `heard` is its first piece, when known. */
  learnerTurn: (heard?: string) => ipcRenderer.send('tutor:learner-turn', heard),
  /** More of the learner's turn, as heard. */
  heard: (text: string) => ipcRenderer.send('tutor:heard', text),
  onCard: (listener: (card: TutorCard) => void) => subscribe('tutor:card', listener),
  onPendingAction: (listener: (action: PendingTutorAction) => void) =>
    subscribe('tutor:pending-action', listener),
  onActionResult: (listener: (result: TutorActionResult) => void) =>
    subscribe('tutor:action-result', listener)
}
