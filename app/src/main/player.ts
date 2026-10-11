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
// A replayed line pauses this long after its end, so the last word isn't cut.
const REPLAY_SLACK = 0.3
// How often a replay checks whether its line has ended, and how long it waits at most (the seek
// may land a few seconds early, where the bar only steps).
const REPLAY_CHECK_MS = 100
const REPLAY_GIVE_UP_MS = 30_000

export class Player extends EventEmitter {
  private clock = new PlayerClock()
  private holders = new Set<Holder>()
  private resumeOnRelease = false
  private expected?: { playing: boolean; timer: NodeJS.Timeout }
  private history: { at: number; position: number }[] = []
  private replayEnd?: NodeJS.Timeout
  private replayGiveUp?: NodeJS.Timeout

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
    this.stopReplay()
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
    // The viewer pressed play or pause: a replay's pause at the line's end is theirs to make now.
    this.stopReplay()
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
    // The video plays on now, so a replay under way must not pause it at its line's end.
    this.stopReplay()
    this.send('play')
  }

  /**
   * Plays a line again from its start, because the learner asked: it plays even while something
   * holds the video. A video that was paused (by the learner or a hold) pauses again when the line
   * ends, so the holds still stand.
   */
  replay(start: number, end?: number): void {
    this.stopReplay()
    const pauseAfter = !this.playing || this.holders.size > 0
    // Expected, so this play isn't taken for the viewer's own (which would drop the holds).
    this.expect(true)
    this.command({ type: 'seek', seconds: Math.max(0, start), from: this.now(), play: true })
    if (!pauseAfter || end === undefined || end <= start) return
    // Paused again once the clock, back at the line's start (or before it), passes its end.
    let back = false
    this.replayEnd = setInterval(() => {
      const now = this.clock.now()
      if (now === undefined || !this.clock.playing) return
      if (now <= start + 1) back = true
      else if (back && now >= end + REPLAY_SLACK) {
        this.stopReplay()
        this.send('pause')
      }
    }, REPLAY_CHECK_MS)
    this.replayGiveUp = setTimeout(() => this.stopReplay(), REPLAY_GIVE_UP_MS)
  }

  private stopReplay(): void {
    clearInterval(this.replayEnd)
    clearTimeout(this.replayGiveUp)
    this.replayEnd = this.replayGiveUp = undefined
  }

  isHeldBy(holder: Holder): boolean {
    return this.holders.has(holder)
  }

  private send(type: 'pause' | 'play'): void {
    this.expect(type === 'play')
    this.command({ type })
  }

  /** Notes that the video should soon be playing (or paused) because Duet asked, not the viewer. */
  private expect(playing: boolean): void {
    this.clearExpected()
    // If the page never does what was asked (no play button found, say), stop holding the video
    // rather than wait on it forever.
    const timer = setTimeout(() => {
      this.expected = undefined
      if (!playing && this.clock.playing) this.dropHolds()
    }, COMMAND_MS)
    this.expected = { playing, timer }
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
