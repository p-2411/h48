// Watch time on Duet's server (spec section 11): while the learner watches with Duet (a video on
// screen, the strip shown, the video playing: the watch log's rule), a watch session is open and
// beats every 30 s. The server counts the time by its own clock; this only says when watching
// starts, goes on and stops. Each start of watching opens a new session, so time paused is never
// counted. index.ts calls tick() from its main loop.
import type { DuetServer } from './server'

const BEAT_EVERY_MS = 30_000
// After a failed start (offline, or the hours cap), wait this long before trying again, doubling
// with each failure up to MAX_RETRY_MS, so a cap reached does not ask the server every 10 s.
const RETRY_MS = 10_000
const MAX_RETRY_MS = 5 * 60_000

type Server = Pick<DuetServer, 'watchId' | 'openWatch' | 'request' | 'forgetWatch'>

export class ServerWatch {
  private lastBeat = 0
  private busy = false
  private retryAt = 0
  private failures = 0
  // The watch session this class beats: one it opened, or one the server client opened for a call
  // (server.ts) while watching.
  private mine?: string
  // A session a call opened while not watching: never taken over, as the server would count the
  // time since it opened (up to 45 s) at its first beat. Watching opens a new one instead.
  private idle?: string

  constructor(private readonly server: Server) {}

  tick(watching: boolean, now = Date.now()): void {
    if (this.busy) return
    const current = this.server.watchId
    if (!watching) {
      // A new stretch of watching starts with a fresh wait.
      this.failures = 0
      this.retryAt = 0
      if (!this.mine) this.idle = current
    }
    if (watching && current && current !== this.mine && current !== this.idle) {
      // A call opened a session (while this one waited to try again, or in place of this one's,
      // which the server then ended): beat that one, or its time would go uncounted.
      this.mine = current
      this.lastBeat = now
      this.failures = 0
    } else if (watching && !this.mine) {
      if (now < this.retryAt) return
      void this.run(async () => {
        this.mine = await this.server.openWatch()
        this.lastBeat = now
        if (this.mine) this.failures = 0
        else this.retryAt = now + Math.min(RETRY_MS * 2 ** this.failures++, MAX_RETRY_MS)
      })
    } else if (watching && this.mine && now - this.lastBeat >= BEAT_EVERY_MS) {
      const id = this.mine
      void this.run(async () => {
        this.lastBeat = now
        try {
          await this.server.request(`/duet/watch/${encodeURIComponent(id)}/beat`, {})
        } catch {
          // The hours cap (server.ts announces it), or a session the server ended: let it go; the
          // next watching tick opens a new one if the server allows.
          this.drop(id)
        }
      })
    } else if (!watching && this.mine) {
      const id = this.mine
      this.drop(id)
      void this.run(async () => {
        await this.server
          .request(`/duet/watch/${encodeURIComponent(id)}/end`, {})
          .catch(() => undefined)
      })
    }
  }

  /** Lets session `id` go; the server client forgets it too, unless a call has opened another. */
  private drop(id: string): void {
    if (this.mine === id) this.mine = undefined
    if (this.server.watchId === id) this.server.forgetWatch()
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy = true
    try {
      await work()
    } finally {
      this.busy = false
    }
  }
}
