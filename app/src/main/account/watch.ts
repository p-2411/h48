// Watch time on Duet's server (spec section 11): while the learner watches with Duet (a video on
// screen, the strip shown, the video playing: the watch log's rule), a watch session is open and
// beats every 30 s. The server counts the time by its own clock; this only says when watching
// starts, goes on and stops. Each start of watching opens a new session, so time paused is never
// counted. index.ts calls tick() from its main loop.
import type { DuetServer } from './server'

const BEAT_EVERY_MS = 30_000
// After a failed start (offline), wait this long before trying again.
const RETRY_MS = 10_000

type Server = Pick<DuetServer, 'watchId' | 'openWatch' | 'request' | 'forgetWatch'>

export class ServerWatch {
  private lastBeat = 0
  private busy = false
  private retryAt = 0
  // The watch session this class opened; the server may also open one for a call (server.ts).
  private mine?: string

  constructor(private readonly server: Server) {}

  tick(watching: boolean, now = Date.now()): void {
    if (this.busy) return
    if (watching && !this.mine) {
      if (now < this.retryAt) return
      void this.run(async () => {
        this.mine = await this.server.openWatch()
        this.lastBeat = now
        if (!this.mine) this.retryAt = now + RETRY_MS
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
          this.drop()
        }
      })
    } else if (!watching && this.mine) {
      const id = this.mine
      this.drop()
      void this.run(async () => {
        await this.server
          .request(`/duet/watch/${encodeURIComponent(id)}/end`, {})
          .catch(() => undefined)
      })
    }
  }

  private drop(): void {
    this.mine = undefined
    this.server.forgetWatch()
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
