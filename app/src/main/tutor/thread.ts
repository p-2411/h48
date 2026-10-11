// One conversation thread with Duet, typed or spoken: what Explain (about a line) and Talk (a free
// conversation) both keep. A message goes to the tutor with the thread before it; Try again after a
// failed reply asks again without adding the message twice; turns of a voice conversation that just
// ended join the thread; starting over drops any reply still on its way for the old thread.
import type { ChatMessage, ThreadState } from '../../shared/explain'
import type { TextReply } from './text'

// Bounds on what a page may hand over from a voice conversation.
const MAX_VOICE_TURNS = 200
const MAX_TURN_LENGTH = 4_000

/** What the thread needs of the tutor (src/main/tutor/index.ts). */
export type ThreadTutor = {
  update(change: { conversation: ChatMessage[] }): void
  reply(message: string): Promise<TextReply>
  /** Takes the tutor back for this thread's window, if another window took it over (before voice). */
  claim(): void
}

/** Voice turns from a page, kept only when well formed. */
function voiceTurns(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_VOICE_TURNS)
    .filter(
      (turn): turn is ChatMessage =>
        !!turn && (turn.from === 'learner' || turn.from === 'duet') && typeof turn.text === 'string' && !!turn.text.trim()
    )
    .map((turn) => ({ from: turn.from, text: turn.text.trim().slice(0, MAX_TURN_LENGTH), via: 'voice' }))
}

export class ChatThread {
  private current: ThreadState = { chat: [] }
  // Bumped on reset: a reply for an earlier thread is dropped.
  private generation = 0

  constructor(
    private readonly tutor: ThreadTutor,
    private readonly onChange: (state: ThreadState) => void
  ) {}

  get state(): ThreadState {
    return this.current
  }

  /** The learner's typed message (the same one again, after a failed reply, asks again). */
  ask(text: string): void {
    const message = text.trim()
    const { chat, replying, chatError } = this.current
    if (!message || replying) return
    const last = chat.at(-1)
    const retry = chatError !== undefined && last?.from === 'learner' && last.via === 'text' && last.text === message
    const before = retry ? chat.slice(0, -1) : chat
    // The tutor's context holds the conversation before this message; the message goes with it.
    this.tutor.update({ conversation: before })
    this.set({ chat: [...before, { from: 'learner', text: message, via: 'text' }], replying: true })
    const generation = this.generation
    this.tutor
      .reply(message)
      .then((reply) => {
        if (generation !== this.generation) return
        this.setChat([...this.current.chat, { from: 'duet', text: reply.text, via: 'text', ...(reply.correction && { correction: true }) }])
      })
      .catch((error: Error) => {
        if (generation !== this.generation) return
        this.set({ ...this.current, replying: false, chatError: error.message || 'Could not answer that.' })
      })
  }

  /** This thread's window is about to start voice: the tutor is its conversation again. */
  claim(): void {
    this.tutor.claim()
  }

  /** Turns of a voice conversation that just ended, to keep in the thread. */
  addVoiceTurns(turns: unknown): void {
    const added = voiceTurns(turns)
    if (added.length) this.setChat([...this.current.chat, ...added])
  }

  /** Starts a new, empty thread (another line, another conversation); not told to onChange, since
   * whoever starts over shows the new state itself. */
  reset(): void {
    this.generation++
    this.current = { chat: [] }
  }

  /** The thread changed: show it, and give it to the tutor for the next message or voice session. */
  private setChat(chat: ChatMessage[]): void {
    this.tutor.update({ conversation: chat })
    this.set({ chat })
  }

  private set(state: ThreadState): void {
    this.current = state
    this.onChange(state)
  }
}
