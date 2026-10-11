// Explain that, main-process side: opens the Explain window on a moment and asks the model about it.
// Opening it on another line abandons the request for the old one, so an answer always belongs to
// the line on show.
//
// IPC (all "explain:*"; the page reaches them through window.duet.explain in src/preload/explain.ts):
//   explain:get-state  → ExplainState
//   explain:state      ← sent whenever it changes
//   explain:retry      asks again for the same moment
//   explain:replay     goes back to the moment in the video
//   explain:close      closes the window
import { ipcMain, type BrowserWindow } from 'electron'
import type { ExplainState } from '../../shared/explain'
import type { Moment } from '../../shared/moment'
import { ModelError, type Explainer } from '../ai'
import { createExplainWindow } from '../windows/explain'

export class Explain {
  private window?: BrowserWindow
  private state: ExplainState = { loading: false }
  private request?: AbortController

  constructor(
    private explainer: Explainer | undefined,
    private replay: (moment: Moment) => void
  ) {
    ipcMain.handle('explain:get-state', () => this.state)
    ipcMain.on('explain:retry', () => this.state.moment && this.ask(this.state.moment))
    ipcMain.on('explain:replay', () => this.state.moment && this.replay(this.state.moment))
    ipcMain.on('explain:close', () => this.window?.close())
  }

  open(moment: Moment): void {
    if (!this.window || this.window.isDestroyed()) {
      this.window = createExplainWindow()
      this.window.on('closed', () => {
        this.request?.abort()
        this.window = undefined
      })
    } else this.window.show()
    this.ask(moment)
  }

  private ask(moment: Moment): void {
    this.request?.abort()
    if (!this.explainer) return this.set({ moment, loading: false, error: 'Add an API key to use Explain.' })
    const request = (this.request = new AbortController())
    this.set({ moment, loading: true })
    this.explainer
      .explain(moment, request.signal)
      .then((explanation) => !request.signal.aborted && this.set({ moment, explanation, loading: false }))
      .catch((error) => {
        if (request.signal.aborted) return
        if (!(error instanceof ModelError)) console.error('[duet] explain failed', error)
        this.set({ moment, loading: false, error: error instanceof ModelError ? error.message : 'Could not explain this line.' })
      })
  }

  private set(state: ExplainState): void {
    this.state = state
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('explain:state', state)
  }
}
