// What the home base (src/main/home) and its page share.
import type { Site } from './types'
import type { WordState } from './knowledge'

/** The places in the home base's sidebar; Review is shown inside Cards. */
export type HomePlace = 'today' | 'talk' | 'watching' | 'words' | 'cards' | 'review' | 'settings'

/** The streak: days kept in a row, whether today is kept yet, and the freezes left this week. */
export type Streak = { days: number; keptToday: boolean; freezesLeft: number }

/** A day of this week, for the day dots: kept, frozen (a miss a freeze covered), missed, today (not
 * kept yet) or ahead. */
export type WeekDay = { day: string; state: 'kept' | 'frozen' | 'missed' | 'today' | 'ahead' }

/** Today: the streak, this week's days, and how many cards can be reviewed now. */
export type HomeToday = {
  streak: Streak
  week: WeekDay[]
  /** Whether anything was watched with Duet yet (the session builds itself from what was). */
  hasWatched: boolean
  /** Cards due now, plus new ones still allowed today. */
  due: number
  word?: {
    key: string
    word: string
    meaning: string
    seen: number
    state: WordState
    source?: string
  }
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
export type WatchingVideo = WatchedVideoSummary & {
  siteName: string
  subtitle?: string
  words?: { key: string; word: string; state: WordState }[]
}
