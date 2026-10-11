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

export type Holder = 'wait' | 'tutor'

// How long the reader has to report that a pause or play Duet asked for has happened.
const COMMAND_MS = 1500

export class Player extends EventEmitter {
  private clock = new PlayerClock()
  private holders = new Set<Holder>()
  private resumeOnRelease = false
  private expected?: { playing: boolean; timer: NodeJS.Timeout }

  /** `command` asks the page to pause, play or seek (see CaptionSource.command). */
  constructor(private command: (command: PlayerCommand) => void) {
    super()
  }

  get playing(): boolean {
    return this.clock.playing
  }

  /** Seconds into the video, or undefined while unknown or during an ad. */
  now(): number | undefined {
    return this.clock.now()
  }

  /** A new video: forget the old position, and any holds (they belonged to the old video). */
  reset(): void {
    this.clock.reset()
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
