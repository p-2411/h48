// Live voice minutes (spec section 6). Duet's server charges a call by its own clock and can hang it
// up; each minute the app asks it to keep the call going. At the cap the server ends the call and
// says stop, and Duet ends it here too, with the reason.
import { capSentence, isCapReached } from '../../shared/usage'
import { DuetServerError, type DuetServer } from './server'

const MINUTE_MS = 60_000

export class LiveMeter {
  private session?: string
  private timer?: ReturnType<typeof setInterval>
  private retry?: ReturnType<typeof setTimeout>

  constructor(
    private readonly server: Pick<DuetServer, 'request'>,
    private readonly onStop: (sentence: string) => void,
    private readonly everyMs = MINUTE_MS
  ) {}

  /** A call started (its session id from the server). */
  started(sessionId: string): void {
    this.ended()
    this.session = sessionId
    this.timer = setInterval(() => void this.minute(sessionId), this.everyMs)
  }

  /** The call ended (or its window went away). Tells the server once. */
  ended(): void {
    const session = this.session
    this.stopTimer()
    if (!session) return
    this.session = undefined
    void this.server
      .request(`/duet/live/${encodeURIComponent(session)}/end`, {})
      .catch(() => undefined)
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (this.retry) clearTimeout(this.retry)
    this.retry = undefined
  }

  /** The server already ended and hung up the call: ended here, with nothing more to tell it. */
  private stop(sentence: string): void {
    this.session = undefined
    this.stopTimer()
    this.onStop(sentence)
  }

  private async minute(sessionId: string): Promise<void> {
    try {
      const reply = await this.server.request<{ stop: boolean }>(
        `/duet/live/${encodeURIComponent(sessionId)}/minute`,
        {}
      )
      if (!reply.stop || this.session !== sessionId) return
      this.stop(isCapReached(reply) ? capSentence(reply) : 'Voice ended.')
    } catch (error) {
      if (this.session !== sessionId) return
      // 404: the server already ended the call (it stopped hearing about it for 90 s, while the
      // computer slept or was offline), so it is ended here too.
      if (error instanceof DuetServerError && error.status === 404) return this.stop('Voice ended.')
      // Offline for a moment: asked again soon, as the server hangs up a call it has not heard
      // about for 90 s, and the next minute call would come too late.
      this.retry ??= setTimeout(() => {
        this.retry = undefined
        void this.minute(sessionId)
      }, this.everyMs / 4)
    }
  }
}
