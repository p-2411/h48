// When a checkpoint is offered: at a pause the learner made (PAUSE_MS in), or at a natural break,
// the end of a scene or conversation (judged from the dialogue: scenes.ts). An offer stands OFFER_MS
// unless taken. Offers come at most every OFFER_EVERY_MS; after one is left alone they slow to every
// SLOWED_EVERY_MS (never stop), and taking one brings the normal pace back. Duet's own pauses
// (Explain, Wait, talking to Duet) never count. Pure: index.ts feeds it the app's state each tick.

export const PAUSE_MS = 2_000
// An offer no one takes fades after this long.
export const OFFER_MS = 10_000
export const OFFER_EVERY_MS = 5 * 60_000
export const SLOWED_EVERY_MS = 10 * 60_000
// A scene end older than this is gone: not offered late.
const BREAK_LATE_MS = 10_000

export type Offer = 'pause' | 'break'

export type TriggerState = {
  now: number
  /** The video on screen (its watch-log key), if any. */
  video?: string
  playing: boolean
  /** Duet is holding the video (Explain, Wait, talking to Duet): not the learner's pause. */
  heldByDuet: boolean
  /** When a scene or conversation last ended (the line that ended it went by). */
  sceneEndedAt?: number
  /** There are lines to make a checkpoint from. */
  canOffer: boolean
  /** A checkpoint is open. */
  open: boolean
}

export class CheckpointTriggers {
  private video?: string
  private offer?: { reason: Offer; at: number }
  private lastOfferAt?: number
  // The last offer was left alone: the next waits longer.
  private slowed = false
  private pausedSince?: number
  // This pause or this scene end has had its offer already.
  private offeredThisPause = false
  private offeredForScene?: number

  /** The offer standing now, if any. Call on every tick. */
  tick(state: TriggerState): Offer | undefined {
    const { now } = state
    if (state.video !== this.video) {
      this.video = state.video
      this.offer = undefined
      this.slowed = false
      this.offeredThisPause = false
      this.offeredForScene = undefined
    }
    const learnerPaused = !state.playing && !state.heldByDuet
    if (learnerPaused) this.pausedSince ??= now
    else {
      this.pausedSince = undefined
      this.offeredThisPause = false
    }

    if (this.offer) {
      if (now - this.offer.at >= OFFER_MS) {
        this.offer = undefined
        this.slowed = true
      }
      return this.offer?.reason
    }

    const every = this.slowed ? SLOWED_EVERY_MS : OFFER_EVERY_MS
    const allowed =
      !!state.video && state.canOffer && !state.open && (this.lastOfferAt === undefined || now - this.lastOfferAt >= every)
    if (!allowed) return undefined
    if (learnerPaused && !this.offeredThisPause && now - this.pausedSince! >= PAUSE_MS) {
      this.offeredThisPause = true
      return this.make('pause', now)
    }
    const scene = state.sceneEndedAt
    if (state.playing && scene !== undefined && now - scene < BREAK_LATE_MS && this.offeredForScene !== scene) {
      this.offeredForScene = scene
      return this.make('break', now)
    }
    return undefined
  }

  /** The learner took the offer: the checkpoint opens, and the normal pace is back. */
  accept(): void {
    this.offer = undefined
    this.slowed = false
  }

  private make(reason: Offer, now: number): Offer {
    this.offer = { reason, at: now }
    this.lastOfferAt = now
    return reason
  }
}
