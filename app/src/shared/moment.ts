// A moment: one line the learner picked, frozen with what came before it and where it came from.
// Every feature that helps with a line (Explain that, the voice tutor, pronunciation practice,
// saving a card) starts from a moment, so they all see the same context. It is a copy: lines that
// change later (a translation finishing, the video moving on) never change a moment already taken.
import type { Language, OverlayLine, Site } from './types'

export type MomentLine = { original: string; translation?: string }

export type Moment = {
  language: Language
  /** The line picked, with its translation and word pairs when they are ready. */
  line: OverlayLine
  /** Lines just before it, oldest first: the last 20 seconds, at most 1,500 characters. Later
   * lines are never included, so nothing is spoiled. */
  earlier: MomentLine[]
  video: {
    site: Site
    url?: string
    /** The site's own id for the video (YouTube's v= parameter, Netflix's watch id). */
    id?: string
    /** Seconds into the video where the line starts, when known. */
    position?: number
  }
  /** When the moment was taken, in milliseconds since 1970. */
  takenAt: number
}
