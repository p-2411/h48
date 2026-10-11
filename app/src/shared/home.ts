// What the home base (src/main/home) and its page share.
import type { Site } from './types'

/** The places in the home base's sidebar; Review is shown inside Cards. */
export type HomePlace = 'today' | 'talk' | 'watching' | 'words' | 'cards' | 'review' | 'settings'

/** The streak: days kept in a row, whether today is kept yet, and the freezes left this week. */
export type Streak = { days: number; keptToday: boolean; freezesLeft: number }

/** Today: the streak and how many cards can be reviewed now. */
export type HomeToday = {
  streak: Streak
  /** Cards due now, plus new ones still allowed today. */
  due: number
}

/** A video watched with Duet, for Watching. */
export type WatchedVideoSummary = {
  /** The watch log's key for it (site:videoId). */
  key: string
  site: Site
  videoId: string
  title?: string
  /** Seconds into the video where the learner left off, when known. */
  position?: number
  lastWatched: number
  watchedMs: number
}

/** A video in Watching: as watched, with its site's name ("YouTube"). */
export type WatchingVideo = WatchedVideoSummary & { siteName: string }
