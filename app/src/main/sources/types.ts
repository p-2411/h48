// The contract for a video site. Everything Duet knows about a site lives in one file here
// (youtube.ts, netflix.ts), plus that site's entry in the caption reader's `sites` table
// (native/macos/CaptionReader.swift): which page elements hold the captions, the player state and
// its buttons. Nothing else in the app checks which site it is on.
import type { Language, Site } from '../../shared/types'

/** One timed line of a video's transcript, in seconds. */
export type TranscriptLine = { text: string; start: number; end: number }

export interface Source {
  readonly site: Site
  /** Shown to the learner, e.g. "YouTube". */
  readonly name: string
  /** Whether a page address belongs to this site. */
  matches(url: string): boolean
  /** The site's id for the video at this address, or undefined when the page is not a video. */
  videoId(url: string): string | undefined
  /** The video's whole timed transcript in a language, when the site offers one; then the captions
   * need not be on and lines are processed before they are spoken. Without it, lines come from the
   * captions on screen. */
  fetchTranscript?(videoId: string, language: Language, signal?: AbortSignal): Promise<TranscriptLine[] | undefined>
  /** Duet hears this site's videos from the start, instead of waiting for captions to appear (on
   * macOS, where it can hear the browser). Captions in the language being learnt still take over
   * whenever they are on screen. */
  readonly listensFirst?: boolean
  /** What the caption reader can do with this site's player. */
  readonly controls: { playPause: boolean; seek: boolean }
  /** The video's title from the browser window's title, or undefined when it doesn't show one. */
  videoTitle(windowTitle: string): string | undefined
  /** An address that opens the video at a point, for going back to a saved moment. */
  linkAt(videoId: string, seconds: number): string
}
