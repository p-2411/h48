// Explain that, main-process side: the side panel's Explain tab on a moment. It listens to how the
// line was said (when it can) and asks the model to explain it; the explanation is Duet's first
// message, and the conversation about the line follows, in text or voice, with the tutor (src/main/
// tutor), which gets the same line context: the line, how it was said, the explanation and the
// conversation so far. Opening Explain on another line abandons the requests for the old one and
// starts a new conversation, so an answer always belongs to the line on show; closing the panel
// abandons them too.
//
// IPC (all "explain:*"; the page reaches them through window.duet.explain in src/preload/explain.ts):
//   explain:get-state    → ExplainState
//   explain:state        ← sent whenever it changes
//   explain:retry        asks again for the same moment
//   explain:replay       goes back to the moment in the video
//   explain:ask          the learner's message in the text conversation (the same message again,
//                        after a failed reply, asks again without adding it twice)
//   explain:voice-turns  turns of a voice conversation that just ended, to keep in the thread
import { ipcMain } from 'electron'
import type { ChatMessage, ExplainState, HearingNote } from '../../shared/explain'
import type { Moment } from '../../shared/moment'
import { ModelError, type Explainer } from '../ai'
import type { Delivery } from '../ai/voice'
import type { Panel } from '../panel'
import type { Tutor } from '../tutor'

// Bounds on what the panel may hand over from a voice conversation.
const MAX_VOICE_TURNS = 200
const MAX_TURN_LENGTH = 4_000

type Options = {
  explainer?: Explainer
  replay: (moment: Moment) => void
  panel: Panel
  tutor: Tutor
  hear: (moment: Moment, signal: AbortSignal) => Promise<{ delivery?: Delivery; note: HearingNote }>
}

/** Voice turns from the panel, kept only when well formed. */
function voiceTurns(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_VOICE_TURNS)
    .filter(
      (turn): turn is ChatMessage =>
        !!turn &&
        (turn.from === 'learner' || turn.from === 'duet') &&
        typeof turn.text === 'string' &&
        !!turn.text.trim()
    )
    .map((turn) => ({
      from: turn.from,
      text: turn.text.trim().slice(0, MAX_TURN_LENGTH),
      via: 'voice'
    }))
}

export class Explain {
  private state: ExplainState = { loading: false, chat: [] }
  private request?: AbortController

  constructor(private readonly options: Options) {
    const { panel } = options
    ipcMain.handle('explain:get-state', () => this.state)
    ipcMain.on('explain:retry', () => this.state.moment && this.ask(this.state.moment))
    ipcMain.on('explain:replay', () => this.state.moment && options.replay(this.state.moment))
    ipcMain.on('explain:ask', (event, message: string) => {
      if (panel.owns(event.sender)) this.followUp(String(message ?? '').trim())
    })
    ipcMain.on('explain:voice-turns', (event, turns: unknown) => {
      if (!panel.owns(event.sender)) return
      const added = voiceTurns(turns)
      if (added.length) this.setChat([...this.state.chat, ...added])
    })
    panel.on('closed', () => this.request?.abort())
  }

  open(moment: Moment): void {
    this.options.panel.show('explain')
    this.ask(moment)
  }

  private ask(moment: Moment): void {
    const { explainer, tutor, hear } = this.options
    this.request?.abort()
    tutor.open({ moment })
    if (!explainer)
      return this.set({ moment, loading: false, chat: [], error: 'Add an API key to use Explain.' })
    const request = (this.request = new AbortController())
    this.set({ moment, loading: true, stage: 'listening', chat: [] })
    hear(moment, request.signal)
      .then(async ({ delivery, note }) => {
        if (request.signal.aborted) return
        tutor.update({ delivery })
        this.set({ moment, loading: true, stage: 'explaining', hearing: note, chat: [] })
        const explanation = await explainer.explain(moment, delivery, request.signal)
        if (request.signal.aborted) return
        tutor.update({ explanation })
        this.set({ moment, explanation, loading: false, hearing: note, chat: [] })
      })
      .catch((error) => {
        if (request.signal.aborted) return
        if (!(error instanceof ModelError)) console.error('[duet] explain failed', error)
        this.set({
          moment,
          loading: false,
          chat: [],
          error: error instanceof ModelError ? error.message : 'Could not explain this line.'
        })
      })
  }

  /** The learner's message in the text conversation about the line on show. */
  private followUp(message: string): void {
    const { moment, replying, chat, chatError } = this.state
    if (!message || !moment || replying) return
    const request = this.request
    // Try again after a failed reply sends the same message, which is already the last turn: it is
    // asked again, not added twice.
    const last = chat.at(-1)
    const retry =
      chatError !== undefined &&
      last?.from === 'learner' &&
      last.via === 'text' &&
      last.text === message
    const before = retry ? chat.slice(0, -1) : chat
    // The tutor's context holds the conversation before this message; the message goes with it.
    this.options.tutor.update({ conversation: before })
    this.update({
      chat: [...before, { from: 'learner', text: message, via: 'text' }],
      replying: true,
      chatError: undefined
    })
    this.options.tutor
      .reply(message)
      .then((reply) => {
        if (request?.signal.aborted || this.state.moment !== moment) return
        this.update({ replying: false })
        this.setChat([
          ...this.state.chat,
          {
            from: 'duet',
            text: reply.text,
            via: 'text',
            ...(reply.correction && { correction: true })
          }
        ])
      })
      .catch((error: Error) => {
        if (request?.signal.aborted || this.state.moment !== moment) return
        this.update({ replying: false, chatError: error.message || 'Could not answer that.' })
      })
  }

  /** The thread changed: show it, and give it to the tutor for the next message or voice session. */
  private setChat(chat: ChatMessage[]): void {
    this.options.tutor.update({ conversation: chat })
    this.update({ chat })
  }

  private update(change: Partial<ExplainState>): void {
    this.set({ ...this.state, ...change })
  }

  private set(state: ExplainState): void {
    this.state = state
    this.options.panel.send('explain:state', state)
  }
}
