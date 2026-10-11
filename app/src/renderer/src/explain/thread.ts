// A conversation thread's bridge to the main process: Explain's (window.duet.explain, about a line)
// or Talk's (window.duet.talk, a free conversation). Conversation.tsx works with either.
import type { ThreadState } from '../../../shared/explain'
import type { TranscriptSegment } from './voice/useLiveTutor'

export type VoiceTurn = { from: 'learner' | 'duet'; text: string }

export type ThreadBridge = {
  /** The learner's typed message (the same one again, after a failed reply, asks again). */
  ask(text: string): void
  /** Turns of a voice conversation that just ended, to keep in the thread. */
  voiceTurns(turns: VoiceTurn[]): void
  /** Voice is about to start: the conversation (with its tools) is this window's again. If this
   * fails, voice starts anyway and says why it can't (the tutor refuses another window's voice). */
  claim(): Promise<unknown>
}

/** What a conversation shows: the thread, and whether Duet is still preparing (Explain explaining). */
export type ConversationState = ThreadState & { loading?: boolean }

/** A voice session's transcript, as turns of the thread. */
export function voiceTurns(transcripts: TranscriptSegment[]): VoiceTurn[] {
  return transcripts.map((turn) => ({ from: turn.role === 'tutor' ? 'duet' : 'learner', text: turn.text }))
}
