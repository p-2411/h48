// Explain that, main-process side: shows the side panel's Explain tab on a moment, listens to how the
// line was said (when it can), and asks the model about it. Opening it on another line abandons the request for the old one, so an answer always
// belongs to the line on show; closing the panel abandons it too.
//
// IPC (all "explain:*"; the page reaches them through window.duet.explain in src/preload/explain.ts):
//   explain:get-state  → ExplainState
//   explain:state      ← sent whenever it changes
//   explain:retry      asks again for the same moment
//   explain:replay     goes back to the moment in the video
import { ipcMain } from 'electron'
import type { ExplainState, HearingNote } from '../../shared/explain'
import type { Moment } from '../../shared/moment'
import { ModelError, type Explainer } from '../ai'
import type { Delivery } from '../ai/voice'
import type { Panel } from '../panel'

export class Explain {
  private state: ExplainState = { loading: false }
  private request?: AbortController

  constructor(
    private explainer: Explainer | undefined,
    private replay: (moment: Moment) => void,
    private panel: Panel,
    private hear: (moment: Moment, signal: AbortSignal) => Promise<{ delivery?: Delivery; note: HearingNote }>
  ) {
    ipcMain.handle('explain:get-state', () => this.state)
    ipcMain.on('explain:retry', () => this.state.moment && this.ask(this.state.moment))
    ipcMain.on('explain:replay', () => this.state.moment && this.replay(this.state.moment))
    panel.on('closed', () => this.request?.abort())
  }

  open(moment: Moment): void {
    this.panel.show('explain')
    this.ask(moment)
  }

  private ask(moment: Moment): void {
    this.request?.abort()
    if (!this.explainer) return this.set({ moment, loading: false, error: 'Add an API key to use Explain.' })
    const explainer = this.explainer
    const request = (this.request = new AbortController())
    this.set({ moment, loading: true, stage: 'listening' })
    this.hear(moment, request.signal)
      .then(async ({ delivery, note }) => {
        if (request.signal.aborted) return
        this.set({ moment, loading: true, stage: 'explaining', hearing: note })
        const explanation = await explainer.explain(moment, delivery, request.signal)
        if (!request.signal.aborted) this.set({ moment, explanation, loading: false, hearing: note })
      })
      .catch((error) => {
        if (request.signal.aborted) return
        if (!(error instanceof ModelError)) console.error('[duet] explain failed', error)
        this.set({ moment, loading: false, error: error instanceof ModelError ? error.message : 'Could not explain this line.' })
      })
  }

  private set(state: ExplainState): void {
    this.state = state
    this.panel.send('explain:state', state)
  }
}
