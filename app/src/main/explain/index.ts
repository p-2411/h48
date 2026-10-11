// Explain that, main-process side: shows the side panel's Explain tab on a moment, listens to how the
// line was said (when it can), and asks the model about it; then the learner can chat about the
// line. Opening it on another line abandons the requests for the old one (and starts a new
// conversation), so an answer always belongs to the line on show; closing the panel abandons them too.
//
// IPC (all "explain:*"; the page reaches them through window.duet.explain in src/preload/explain.ts):
//   explain:get-state  → ExplainState
//   explain:state      ← sent whenever it changes
//   explain:retry      asks again for the same moment
//   explain:replay     goes back to the moment in the video
//   explain:ask        a follow-up question about the line
import { ipcMain } from 'electron'
import type { ExplainState, HearingNote } from '../../shared/explain'
import type { Moment } from '../../shared/moment'
import { ModelError, type Explainer } from '../ai'
import type { Delivery } from '../ai/voice'
import type { Panel } from '../panel'

export class Explain {
  private state: ExplainState = { loading: false, chat: [] }
  private request?: AbortController
  // How the line was said, kept for the conversation about it.
  private delivery?: Delivery

  constructor(
    private explainer: Explainer | undefined,
    private replay: (moment: Moment) => void,
    private panel: Panel,
    private hear: (moment: Moment, signal: AbortSignal) => Promise<{ delivery?: Delivery; note: HearingNote }>
  ) {
    ipcMain.handle('explain:get-state', () => this.state)
    ipcMain.on('explain:retry', () => this.state.moment && this.ask(this.state.moment))
    ipcMain.on('explain:replay', () => this.state.moment && this.replay(this.state.moment))
    ipcMain.on('explain:ask', (_, question: string) => this.followUp(String(question ?? '').trim()))
    panel.on('closed', () => this.request?.abort())
  }

  open(moment: Moment): void {
    this.panel.show('explain')
    this.ask(moment)
  }

  private ask(moment: Moment): void {
    this.request?.abort()
    this.delivery = undefined
    if (!this.explainer) return this.set({ moment, loading: false, chat: [], error: 'Add an API key to use Explain.' })
    const explainer = this.explainer
    const request = (this.request = new AbortController())
    this.set({ moment, loading: true, stage: 'listening', chat: [] })
    this.hear(moment, request.signal)
      .then(async ({ delivery, note }) => {
        if (request.signal.aborted) return
        this.delivery = delivery
        this.set({ moment, loading: true, stage: 'explaining', hearing: note, chat: [] })
        const explanation = await explainer.explain(moment, delivery, request.signal)
        if (!request.signal.aborted) this.set({ moment, explanation, loading: false, hearing: note, chat: [] })
      })
      .catch((error) => {
        if (request.signal.aborted) return
        if (!(error instanceof ModelError)) console.error('[duet] explain failed', error)
        this.set({ moment, loading: false, chat: [], error: error instanceof ModelError ? error.message : 'Could not explain this line.' })
      })
  }

  /** A follow-up question in the conversation about the line on show. */
  private followUp(question: string): void {
    const { moment, explanation, chat, replying } = this.state
    if (!question || !moment || !explanation || replying || !this.explainer) return
    const request = this.request
    this.update({ chat: [...chat, { from: 'learner', text: question }], replying: true, chatError: undefined })
    this.explainer
      .reply(moment, explanation, this.delivery, chat, question, request?.signal)
      .then((reply) => {
        if (request?.signal.aborted) return
        this.update({ chat: [...this.state.chat, { from: 'duet', text: reply }], replying: false })
      })
      .catch((error) => {
        if (request?.signal.aborted) return
        if (!(error instanceof ModelError)) console.error('[duet] reply failed', error)
        this.update({ replying: false, chatError: error instanceof ModelError ? error.message : 'Could not answer that.' })
      })
  }

  private update(change: Partial<ExplainState>): void {
    this.set({ ...this.state, ...change })
  }

  private set(state: ExplainState): void {
    this.state = state
    this.panel.send('explain:state', state)
  }
}
