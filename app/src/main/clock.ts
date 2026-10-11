// The video's position, to a fraction of a second, from the reader's time updates.
//
// The seek bar only gives whole seconds, and YouTube stops updating it while the player controls
// are hidden (measured: no update for 6-15 s at a time), while the play state stays current. So
// while the video plays the clock runs on its own, and each update from the bar corrects it:
// - the number going up by one, promptly, marks the moment that second began;
// - a number that agrees with the clock (the bar catching up after a stall) leaves it running;
// - anything else is a seek, and the clock guesses the middle of that second.

export type PlayerTime = { t: number; playing: boolean; ad: boolean; at: number }

// An update this soon after the last one, one second further on, is the bar moving live.
const LIVE_TICK_MS = 1500

export class PlayerClock {
  private anchor?: { time: number; at: number }
  private last?: PlayerTime

  update(time: PlayerTime): void {
    const last = this.last
    // Where the video had got to, worked out before this update replaces the last one.
    const reached = this.now(time.at)
    this.last = time
    if (!last || !Number.isInteger(time.t)) {
      this.anchor = { time: Number.isInteger(time.t) ? time.t + 0.5 : time.t, at: time.at }
    } else if (last.playing && time.playing && time.t === last.t + 1 && time.at - last.at < LIVE_TICK_MS) {
      this.anchor = { time: time.t, at: time.at }
    } else if (reached !== undefined && time.t === last.t) {
      // A pause or resume: the bar may be stale, so the clock's own position is the better one.
      this.anchor = { time: reached, at: time.at }
    } else if (reached !== undefined && reached > time.t - 1 && reached < time.t + 2) {
      this.anchor = { time: Math.min(Math.max(reached, time.t), time.t + 0.99), at: time.at }
    } else {
      this.anchor = { time: time.t + 0.5, at: time.at }
    }
  }

  /** Whether the reader has reported the video's position and play state at all. */
  get known(): boolean {
    return this.last !== undefined
  }

  /** Whether the video is playing, as last reported. */
  get playing(): boolean {
    return !!this.last?.playing && !this.last.ad
  }

  /** The position in seconds, or undefined while unknown or while an ad plays. */
  now(at = Date.now()): number | undefined {
    const last = this.last
    if (!this.anchor || !last || last.ad) return undefined
    if (!last.playing) return this.anchor.time
    return this.anchor.time + (at - this.anchor.at) / 1000
  }

  reset(): void {
    this.anchor = undefined
    this.last = undefined
  }
}
