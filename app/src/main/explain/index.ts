// Explain that, main-process side: the side panel's Explain tab on a moment. It listens to how the
// line was said (when it can) and asks the model to explain it; the explanation is Duet's first
// message, and the conversation about the line follows, in text or voice, with the tutor (src/main/
// tutor), which gets the same line context: the line, how it was said, the explanation and the
// conversation so far (the thread: src/main/tutor/thread.ts). Opening Explain on another line abandons the requests for the old one and
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
//   explain:claim        voice is about to start: the tutor is this line's conversation again
import { ipcMain } from 'electron'
import type { ExplainState, HearingNote } from '../../shared/explain'
import type { Moment } from '../../shared/moment'
import { ModelError, type Explainer } from '../ai'
import type { Delivery } from '../ai/voice'
import type { Panel } from '../panel'
import type { Tutor } from '../tutor'
import type { LineContext } from '../tutor/prompts'
import { ChatThread } from '../tutor/thread'

type Options = {
  explainer?: Explainer
  replay: (moment: Moment) => void
  panel: Panel
  tutor: Tutor
  hear: (moment: Moment, signal: AbortSignal) => Promise<{ delivery?: Delivery; note: HearingNote }>
}

export class Explain {
  private state: ExplainState = { loading: false, chat: [] }
  private request?: AbortController
  private readonly thread: ChatThread
  // What the tutor knows of the line on show, to give it back if another window took the tutor over.
  private context?: LineContext

  constructor(private readonly options: Options) {
    const { panel, tutor } = options
    this.thread = new ChatThread(
      tutor.forWindow(panel, () => this.context!),
      ({ chat, replying, chatError }) => this.update({ chat, replying, chatError })
    )
    ipcMain.handle('explain:get-state', () => this.state)
    // Asks for the explanation again; the conversation so far stays.
    ipcMain.on('explain:retry', () => this.state.moment && this.explain(this.state.moment))
    ipcMain.on('explain:replay', () => this.state.moment && options.replay(this.state.moment))
    ipcMain.on('explain:ask', (event, message: unknown) => {
      if (panel.owns(event.sender) && this.state.moment) this.thread.ask(String(message ?? ''))
    })
    ipcMain.handle('explain:claim', (event) => {
      if (panel.owns(event.sender) && this.state.moment) this.thread.claim()
    })
    ipcMain.on('explain:voice-turns', (event, turns: unknown) => {
      if (panel.owns(event.sender)) this.thread.addVoiceTurns(turns)
    })
    // Closing the panel ends the conversation: the requests, and the tutor's previews and hold.
    panel.on('closed', () => {
      this.request?.abort()
      this.thread.reset()
      options.tutor.end(panel)
    })
  }

  /** Explain on a moment: a new conversation about it, and its explanation. */
  open(moment: Moment): void {
    this.options.panel.show('explain')
    this.request?.abort()
    this.thread.reset()
    this.context = { moment }
    this.options.tutor.open(this.context, this.options.panel)
    this.explain(moment)
  }

  /** Opens on a moment already talked about elsewhere (the strip), with those turns in the thread. */
  openWithTurns(moment: Moment, turns: unknown): void {
    this.open(moment)
    this.thread.addVoiceTurns(turns)
  }

  /** Listens to the moment and asks for its explanation (again, after a failure). */
  private explain(moment: Moment): void {
    const { explainer, hear } = this.options
    this.request?.abort()
    if (!explainer)
      return this.set({ moment, loading: false, ...this.thread.state, error: 'Add an API key to use Explain.', retryable: false })
    const request = (this.request = new AbortController())
    this.set({ moment, loading: true, stage: 'listening', ...this.thread.state })
    hear(moment, request.signal)
      .then(async ({ delivery, note }) => {
        if (request.signal.aborted) return
        this.learnt({ delivery })
        this.set({ moment, loading: true, stage: 'explaining', hearing: note, ...this.thread.state })
        const explanation = await explainer.explain(moment, delivery, request.signal)
        if (request.signal.aborted) return
        this.learnt({ explanation })
        this.set({ moment, explanation, loading: false, hearing: note, ...this.thread.state })
      })
      .catch((error) => {
        if (request.signal.aborted) return
        if (!(error instanceof ModelError)) console.error('[duet] explain failed', error)
        this.set({
          moment,
          loading: false,
          ...this.thread.state,
          error: error instanceof ModelError ? error.message : 'Could not explain this line.'
        })
      })
  }

  /** Something new about the line on show (how it was said, the explanation), for the tutor. */
  private learnt(change: Pick<LineContext, 'delivery' | 'explanation'>): void {
    if (this.context) this.context = { ...this.context, ...change }
    this.options.tutor.update(this.options.panel, change)
  }

  private update(change: Partial<ExplainState>): void {
    this.set({ ...this.state, ...change })
  }

  private set(state: ExplainState): void {
    this.state = state
    this.options.panel.send('explain:state', state)
  }
}
