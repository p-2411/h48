// Progress, main-process side: how much of each video the learner understands, now and then, and
// each video's reading level (src/shared/progress.ts). It reads each video's words from the watch
// log and their rungs from the knowledge ladder. As a line is met, its words new to the video are
// credited as they are known right then (noteMet, from watchlog/connect.ts): that is the video's
// "then"; "now" is worked out from today's rungs each time the home base asks. Emits "changed" when
// a video's words or credits change (the home base asks again). Spec:
// docs/superpowers/specs/2026-10-16-progress-tracking-design.md.
import { EventEmitter } from 'events'
import {
  CREDIT,
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
import type { WatchLog } from '../watchlog'
import { rankOf as listRank } from './frequency'

type Log = Pick<
  WatchLog,
  | 'tallyKeptLines'
  | 'tallyChanges'
  | 'videoWords'
  | 'allVideoWords'
  | 'uncredited'
  | 'uncreditedVideos'
  | 'creditFirst'
>

type KeptVideo = { words: TalliedWord[]; level?: ReadingLevel }

/** Each video's words in a language, and its reading level (no rung changes it), kept until the
 * watch log says that video's words changed: reading them all is the slow part of a summary, and the
 * home base asks often. */
type Kept = {
  language: Language
  /** The watch log's tallyChanges().all when read. */
  all: number
  /** Each video's count in tallyChanges().videos when read. */
  seen: Map<string, number>
  videos: Map<string, KeptVideo>
}

export class Progress extends EventEmitter {
  private log: Log
  private knowledge: Pick<Knowledge, 'statesFor'>
  private rankOf: (language: Language) => RankOf
  private kept?: Kept

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
    super()
    this.log = log
    this.knowledge = knowledge
    this.rankOf = rankOf
  }

  /** Once, after Duet's windows are up: tallies the lines kept from before videos' words were, and
   * credits those words as they are known now (the best there is for them). */
  catchUp(now = Date.now()): void {
    try {
      this.log.tallyKeptLines()
      for (const { key, language } of this.log.uncreditedVideos()) this.credit(key, language, now)
    } catch (error) {
      console.error('[duet] progress: could not tally the lines kept', error)
    }
    this.emit('changed')
  }

  /** A line of `key` was met (and tallied): its words new to the video are credited as known now. */
  noteMet(key: string, language: Language, now = Date.now()): void {
    if (this.credit(key, language, now)) this.emit('changed')
  }

  /** Credits a video's words not credited yet; returns whether there were any. */
  private credit(key: string, language: Language, now: number): boolean {
    const words = this.log.uncredited(key, language)
    if (!words.length) return false
    const states = this.knowledge.statesFor(language, words, now)
    this.log.creditFirst(
      key,
      language,
      Object.fromEntries(words.map((word) => [word, CREDIT[states[word] ?? 'unknown']]))
    )
    return true
  }

  /** Each video watched in `language` with its reading level and its % now and then, and each
   * level's averages. */
  summary(language: Language, now = Date.now()): ProgressSummary {
    const kept = this.keptFor(language)
    const keys = new Set<string>()
    for (const { words } of kept.videos.values()) for (const word of words) keys.add(word.key)
    const states = this.knowledge.statesFor(language, [...keys], now)
    const videos: Record<string, VideoProgress> = {}
    for (const [key, { words, level }] of kept.videos) {
      const video: VideoProgress = {}
      if (level !== undefined) video.level = level
      const score = videoScore(words, states)
      if (score) {
        video.now = percent(score.now)
        video.then = percent(score.then)
      }
      videos[key] = video
    }
    return { videos, levels: levelsOf(Object.values(videos)) }
  }

  /** Videos' words in `language`: all read again when every video's may have changed (or for
   * another language), else only those of the videos whose words changed. */
  private keptFor(language: Language): Kept {
    const changes = this.log.tallyChanges()
    const rank = this.rankOf(language)
    const keep = (words: TalliedWord[]): KeptVideo => ({
      words,
      level: readingLevel(language, words, rank)
    })
    if (this.kept?.language !== language || this.kept.all !== changes.all) {
      const videos = new Map<string, KeptVideo>()
      for (const [key, words] of this.log.allVideoWords(language)) videos.set(key, keep(words))
      this.kept = { language, all: changes.all, seen: new Map(changes.videos), videos }
      return this.kept
    }
    for (const [key, count] of changes.videos) {
      if (this.kept.seen.get(key) === count) continue
      this.kept.seen.set(key, count)
      const words = this.log.videoWords(key, language)
      if (words.length) this.kept.videos.set(key, keep(words))
      else this.kept.videos.delete(key)
    }
    return this.kept
  }
}
