// Talk's bridge to the main process (src/main/talk): a free conversation with Duet in the home base.
import type { ChatMessage, ThreadState } from '../shared/explain'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const talkApi = {
  /** Talk is on show: the conversation (with Duet's tools) is the home window's again. */
  open: () => invoke<ThreadState>('talk:open'),
  /** A new, empty conversation. */
  start: () => invoke<ThreadState>('talk:new'),
  onState: (listener: (state: ThreadState) => void) => subscribe('talk:state', listener),
  /** The learner's typed message. */
  ask: (message: string) => invoke<void>('talk:ask', message),
  /** Turns of a voice conversation that just ended, to keep in the thread. */
  voiceTurns: (turns: Pick<ChatMessage, 'from' | 'text'>[]) => invoke<void>('talk:voice-turns', turns)
}
