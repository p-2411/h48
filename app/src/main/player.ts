// The video player as Duet sees it: where the video is (through PlayerClock), whether it plays,
// and the one place that pauses and plays it.
//
// Features never press play or pause themselves. They hold the video ("wait", "tutor") and release
// it when done; it is paused while anything holds it, and plays again when the last hold is
// released only if it was playing when the first hold began. The viewer always wins: pressing play
// while the video is held drops every hold (each holder hears "overridden"), and pausing it
// themselves means nothing plays it again on release.
import { EventEmitter } from 'events'
import type { PlayerCommand } from './captions'
import { PlayerClock, type PlayerTime } from './clock'

export type Holder = 'wait' | 'tutor' | 'explain'

// How long the reader has to report that a pause or play Duet asked for has happened.
const COMMAND_MS = 1500
// How far back the record of video time against real time goes (the audio reader keeps a minute).
const HISTORY_MS = 70_000

export class Player extends EventEmitter {
  private clock = new PlayerClock()
  private holders = new Set<Holder>()
  private resumeOnRelease = false
  private expected?: { playing: boolean; timer: NodeJS.Timeout }
  private history: { at: number; position: number }[] = []

  /** `command` asks the page to pause, play or seek (see CaptionSource.command). */
  constructor(private command: (command: PlayerCommand) => void) {
    super()
  }

  get playing(): boolean {
    return this.clock.playing
  }

  /** Whether Duet has seen the play state at all. On Netflix it can't while the player's controls
   * are hidden, until they first show. */
  get stateKnown(): boolean {
    return this.clock.known
  }

  /** Seconds into the video, or undefined while unknown or during an ad. */
  now(): number | undefined {
    return this.clock.now()
  }

  /** Notes where the video is now, so a point in the video can later be matched to when it played
   * (for cutting a line out of the audio). Call often. */
  sample(at = Date.now()): void {
    const position = this.clock.now(at)
    if (position !== undefined && this.clock.playing) this.history.push({ at, position })
    while (this.history.length && this.history[0].at < at - HISTORY_MS) this.history.shift()
  }

  /** When (ms since 1970) the video last played the given point, or undefined if not recently. */
  playedAt(seconds: number): number | undefined {
    for (let index = this.history.length - 1; index > 0; index--) {
      const before = this.history[index - 1]
      const after = this.history[index]
      // Only a stretch of ordinary playback between the two samples, not a seek.
      const continuous = Math.abs(after.position - before.position - (after.at - before.at) / 1000) < 0.5
      if (continuous && before.position <= seconds && seconds <= after.position)
        return before.at + (seconds - before.position) * 1000
    }
    return undefined
  }

  /** A new video: forget the old position, and any holds (they belonged to the old video). */
  reset(): void {
    this.clock.reset()
    this.history = []
    this.clearExpected()
    this.holders.clear()
    this.resumeOnRelease = false
  }

  /** A time update from the caption reader. */
  update(time: PlayerTime): void {
    const was = this.clock.playing
    this.clock.update(time)
    const playing = this.clock.playing
    if (playing === was) return
    if (this.expected?.playing === playing) return this.clearExpected()
    // The viewer pressed play or pause.
    if (playing) this.dropHolds()
    else this.resumeOnRelease = false
  }

  hold(holder: Holder): void {
    if (this.holders.has(holder)) return
    if (!this.holders.size) {
      this.resumeOnRelease = this.playing
      if (this.playing) this.send('pause')
    }
    this.holders.add(holder)
  }

  release(holder: Holder): void {
    if (!this.holders.delete(holder) || this.holders.size || !this.resumeOnRelease) return
    this.resumeOnRelease = false
    this.send('play')
  }

  /** Moves the video to a point, in seconds. The clock follows once the reader sees the jump. */
  seek(seconds: number): void {
    this.command({ type: 'seek', seconds: Math.max(0, seconds), from: this.now() })
  }

  isHeldBy(holder: Holder): boolean {
    return this.holders.has(holder)
  }

  private send(type: 'pause' | 'play'): void {
    this.clearExpected()
    const playing = type === 'play'
    // If the page never does what was asked (no play button found, say), stop holding the video
    // rather than wait on it forever.
    const timer = setTimeout(() => {
      this.expected = undefined
      if (!playing && this.clock.playing) this.dropHolds()
    }, COMMAND_MS)
    this.expected = { playing, timer }
    this.command({ type })
  }

  private dropHolds(): void {
    const dropped = [...this.holders]
    this.holders.clear()
    this.resumeOnRelease = false
    for (const holder of dropped) this.emit('overridden', holder)
  }

  private clearExpected(): void {
    clearTimeout(this.expected?.timer)
    this.expected = undefined
  }
}
