// Progress, main-process side: how much of each video the learner understands, then and now, and
// each video's reading level (src/shared/progress.ts). It reads each video's words from the watch
// log and their rungs from the knowledge ladder; the % on the first day a video was watched is its
// "then", noted while it plays (snapshot, from watchlog/connect.ts), and "now" is worked out from
// today's rungs each time the home base asks. Spec:
// docs/superpowers/specs/2026-10-16-progress-tracking-design.md.
import {
  levelsOf,
  percent,
  readingLevel,
  videoScore,
  type ProgressSummary,
  type RankOf,
  type ReadingLevel,
  type TalliedWord,
  type VideoProgress
} from '../../shared/progress'
import type { Language } from '../../shared/types'
import type { Knowledge } from '../knowledge'
import { studyDay } from '../study-day'
import type { WatchLog } from '../watchlog'
import { rankOf as listRank } from './frequency'

type Log = Pick<
  WatchLog,
  'tallyKeptLines' | 'videoWords' | 'allVideoWords' | 'noteScore' | 'firstScores' | 'talliesChanged'
>

/** Videos' words in a language, and what they say that no rung changes (each video's reading level,
 * every word met), kept until the watch log's words change (talliesChanged): reading them all is
 * the slow part of a summary, and the home base asks often. */
type Tallies = {
  language: Language
  changes: number
  videos: Map<string, { words: TalliedWord[]; level?: ReadingLevel }>
  keys: string[]
}

export class Progress {
  private log: Log
  private knowledge: Pick<Knowledge, 'statesFor'>
  private rankOf: (language: Language) => RankOf
  private tallies?: Tallies

  constructor({
    log,
    knowledge,
    rankOf = listRank
  }: {
    log: Log
    knowledge: Pick<Knowledge, 'statesFor'>
    /** The frequency lists (src/main/progress/frequency), or a stand-in for tests. */
    rankOf?: (language: Language) => RankOf
  }) {
    this.log = log
    this.knowledge = knowledge
    this.rankOf = rankOf
    // Lines kept from before videos' words were tallied: tallied once, now.
    try {
      log.tallyKeptLines()
    } catch (error) {
      console.error('[duet] progress: could not tally the lines kept', error)
    }
  }

  /** Notes a video's % today, from its words met so far (nothing until it has a %). */
  snapshot(key: string, language: Language, now = Date.now()): void {
    const words = this.log.videoWords(key, language)
    const score = videoScore(
      words,
      this.knowledge.statesFor(
        language,
        words.map((word) => word.key),
        now
      )
    )
    if (score !== undefined) this.log.noteScore(key, language, score, now)
  }

  /** Each video watched in `language` with its reading level, its % now and then (then once its
   * first day has passed), and each level's averages. */
  summary(language: Language, now = Date.now()): ProgressSummary {
    const tallies = this.talliesFor(language)
    const states = this.knowledge.statesFor(language, tallies.keys, now)
    const firsts = this.log.firstScores(language)
    const today = studyDay(now)
    const videos: Record<string, VideoProgress> = {}
    for (const [key, { words, level }] of tallies.videos) {
      const video: VideoProgress = {}
      if (level !== undefined) video.level = level
      const score = videoScore(words, states)
      if (score !== undefined) video.now = percent(score)
      const first = firsts.get(key)
      if (first && first.day < today) video.then = percent(first.score)
      videos[key] = video
    }
    return { videos, levels: levelsOf(Object.values(videos)) }
  }

  /** Videos' words in `language`, read again only when they have changed. */
  private talliesFor(language: Language): Tallies {
    const changes = this.log.talliesChanged
    if (this.tallies?.language === language && this.tallies.changes === changes) return this.tallies
    const rank = this.rankOf(language)
    const videos: Tallies['videos'] = new Map()
    const keys = new Set<string>()
    for (const [key, words] of this.log.allVideoWords(language)) {
      videos.set(key, { words, level: readingLevel(language, words, rank) })
      for (const word of words) keys.add(word.key)
    }
    this.tallies = { language, changes, videos, keys: [...keys] }
    return this.tallies
  }
}
