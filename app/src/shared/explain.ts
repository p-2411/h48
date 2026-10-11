import type { Moment } from './moment'

// An explanation of one line for the learner ("Explain that"): what it means here and the one thing
// most worth noticing. Fields the line does not need are left out rather than filled.
export type Explanation = {
  /** The explanation: what the line means here, what the speaker is doing with it, and how it comes
   * across (register, attitude, and the delivery when the line was heard). */
  meaning: string
  /** Set when the explanation also draws on the line's audio: the language actually spoken in it. */
  heard?: { spokenLanguage: string }
  /** The one thing most worth noticing; `quote` is the exact words of the line it is about, when they
   * could be found in the line. */
  notice?: { text: string; quote?: string }
  /** What in the wording or the earlier lines supports this reading. */
  why?: string
  /** Another way to say it, and what that changes. */
  alternative?: { expression: string; changes: string }
  /** Missing context or doubt that affects the answer. */
  limitation?: string
  /** A starting point for a card, edited before saving. */
  card: { expression: string; meaning: string; target: string; situation: string }
  /** Who wrote it: the model, and the version of the instructions it had. */
  model: string
  version: number
}

/** Whether Explain could hear the line: heard; asking for the permission (first time); not allowed;
 * the line played too long ago (or not at all); the speech couldn't be made out; or no audio on
 * this computer. */
export type HearingNote = 'heard' | 'asking' | 'not-allowed' | 'not-kept' | 'unclear' | 'off'

/** One message in the conversation about a line, after the explanation: typed, or a turn of a voice
 * conversation, kept once that conversation ends. */
/** One turn of the conversation; `correction` marks a reply of Duet's that corrects the learner. */
export type ChatMessage = { from: 'learner' | 'duet'; text: string; via?: 'text' | 'voice'; correction?: boolean }

/** What the Explain tab shows: the moment, the explanation once it arrives, and the conversation
 * about the line that follows it. */
/** A conversation with Duet (Explain's, or Talk's): the turns, and a reply on its way or failed. */
export type ThreadState = {
  chat: ChatMessage[]
  /** Duet is writing a reply. */
  replying?: boolean
  chatError?: string
}

export type ExplainState = ThreadState & {
  moment?: Moment
  explanation?: Explanation
  loading: boolean
  /** While loading: listening to the line, then explaining it. */
  stage?: 'listening' | 'explaining'
  hearing?: HearingNote
  error?: string
  /** False when asking again can't help (no API key): no Try again. */
  retryable?: boolean
}
