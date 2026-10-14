// Live voice minutes (spec section 6). Duet's server charges a call by its own clock and hangs up a
// call it has not heard about for 90 s. The app keeps a call going with a minute call, but only
// while the voice window says its call is still connected (alive(), about every 20 s): if that
// window closes, crashes, moves on or loses the call, its signs of life stop, the minute calls stop
// with them, and the server hangs up. No end path can be missed. At the cap the server ends the call
// and says stop, and Duet ends it here too, with the reason.
import { capSentence, isCapReached } from '../../shared/usage'
import { DuetServerError, type DuetServer } from './server'

// A minute call at most this often: with signs of life every 20 s, the server hears within 60 s
// even after one failed call, inside its 90 s.
const MINUTE_EVERY_MS = 40_000

export class LiveMeter {
  private session?: string
  private lastMinute = 0
  private busy = false

  constructor(
    private readonly server: Pick<DuetServer, 'request'>,
    private readonly onStop: (sentence: string) => void,
    private readonly now: () => number = Date.now
  ) {}

  /** A call started (its session id from the server). */
  started(sessionId: string): void {
    this.ended()
    this.session = sessionId
    this.lastMinute = this.now()
  }

  /** The voice window says its call is still connected. */
  alive(): void {
    const session = this.session
    if (!session || this.busy || this.now() - this.lastMinute < MINUTE_EVERY_MS) return
    void this.minute(session)
  }

  /** The call ended (or its window went away). Tells the server once. */
  ended(): void {
    const session = this.session
    if (!session) return
    this.session = undefined
    this.endOnServer(session)
  }

  /** A call that came back after voice ended: the server ends it; the call under way (if any) goes on. */
  dropped(sessionId: string): void {
    if (sessionId === this.session) return this.ended()
    this.endOnServer(sessionId)
  }

  private endOnServer(sessionId: string): void {
    void this.server
      .request(`/duet/live/${encodeURIComponent(sessionId)}/end`, {})
      .catch(() => undefined)
  }

  /** The server already ended and hung up the call: ended here, with nothing more to tell it. */
  private stop(sentence: string): void {
    this.session = undefined
    this.onStop(sentence)
  }

  private async minute(sessionId: string): Promise<void> {
    this.busy = true
    try {
      const reply = await this.server.request<{ stop: boolean }>(
        `/duet/live/${encodeURIComponent(sessionId)}/minute`,
        {}
      )
      if (this.session !== sessionId) return
      this.lastMinute = this.now()
      if (reply.stop) this.stop(isCapReached(reply) ? capSentence(reply) : 'Voice ended.')
    } catch (error) {
      // 404: the server already ended the call (it heard nothing for 90 s: the computer slept or
      // was offline), so it is ended here too. Anything else: tried again at the next sign of life.
      if (this.session === sessionId && error instanceof DuetServerError && error.status === 404)
        this.stop('Voice ended.')
    } finally {
      this.busy = false
    }
  }
}
