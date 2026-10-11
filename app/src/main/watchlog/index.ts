// The watch log: what the learner watched with Duet, kept on this Mac. Videos (for Watching), the
// lines met in each (for checkpoints and the daily "say the line"), what the learner did with
// words (hovered, saved, explained, missed in a checkpoint) and each study day's activity (for the
// streak). This class is the only code that touches those tables; connect.ts feeds it.
import type { WatchedVideoSummary } from '../../shared/home'
import type { Language, OverlayLine, Site } from '../../shared/types'
import { database, transaction } from '../store/db'
import { studyDay } from '../study-day'
import { streak, type DayRecord, type Streak } from './streak'

// Lines are kept for this many of the most recently watched videos.
export const VIDEOS_WITH_LINES = 30
// The same words met again this close (seconds) are the same line: caption timing drifts a little.
const SAME_LINE_WITHIN_S = 3
// The same word event again this soon is one event (the pointer going back and forth over a word).
const SAME_EVENT_WITHIN_MS = 60_000
// Watch time is written this often (and on quit), not on every tick.
export const FLUSH_EVERY_MS = 15_000
// Words and lines longer than this are not words or lines (a bad message); they are cut.
const MAX_TEXT = 500

export type WatchedVideo = { site: Site; id: string; url: string; title?: string }
export type WordEventKind = 'hovered' | 'saved' | 'explained' | 'missed'
export type WordEvent = {
  kind: WordEventKind
  videoKey?: string
  language: Language
  text: string
  line?: string
  start?: number
}

/** The key a video is stored under: its site and the site's id for it. */
export function videoKey(video: { site: Site; id: string }): string {
  return `${video.site}:${video.id}`
}

type VideoRow = {
  id: string
  site: Site
  title: string | null
  position: number | null
  last_watched: number
  watched_ms: number
}

function summary(row: VideoRow): WatchedVideoSummary {
  return {
    key: row.id,
    site: row.site,
    videoId: row.id.slice(row.site.length + 1), // the key is site:videoId (see videoKey)
    title: row.title ?? undefined,
    position: row.position ?? undefined,
    lastWatched: row.last_watched,
    watchedMs: row.watched_ms
  }
}

export class WatchLog {
  // Watch time not yet written, by video and study day, and when it was last written.
  private pending = new Map<string, { video: string; day: string; ms: number }>()
  private flushedAt?: number

  /** The video on screen. While the learner watches it, it is added or brought up to date and
   * counts as watched now. Otherwise (open but paused) only a video already on record is brought up
   * to date, with no change to when it was last watched: opening a page is not watching it. */
  noteVideo(
    video: WatchedVideo,
    language: Language,
    position: number | undefined,
    now = Date.now(),
    { watching = true }: { watching?: boolean } = {}
  ): void {
    const key = videoKey(video)
    if (!watching) {
      database()
        .prepare(
          `UPDATE videos SET url = ?, title = COALESCE(?, title), language = ?, position = COALESCE(?, position)
           WHERE id = ?`
        )
        .run(video.url, video.title ?? null, language, position ?? null, key)
      return
    }
    transaction(() => {
      const known = database().prepare('SELECT 1 FROM videos WHERE id = ?').get(key)
      database()
        .prepare(
          `INSERT INTO videos (id, site, url, title, language, position, first_watched, last_watched)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET url = excluded.url, title = COALESCE(excluded.title, videos.title),
             language = excluded.language, position = COALESCE(excluded.position, videos.position),
             last_watched = excluded.last_watched`
        )
        .run(key, video.site, video.url, video.title ?? null, language, position ?? null, now, now)
      if (!known) this.prune()
    })
  }

  /** Videos watched with Duet, the one watched last first. */
  recentVideos(limit: number): WatchedVideoSummary[] {
    const rows = database()
      .prepare(
        'SELECT id, site, title, position, last_watched, watched_ms FROM videos ORDER BY last_watched DESC LIMIT ?'
      )
      .all(limit) as VideoRow[]
    return rows.map(summary)
  }

  /** One video watched with Duet, by its key. */
  video(key: string): WatchedVideoSummary | undefined {
    const row = database()
      .prepare(
        'SELECT id, site, title, position, last_watched, watched_ms FROM videos WHERE id = ?'
      )
      .get(key) as VideoRow | undefined
    return row && summary(row)
  }

  /** A line the learner met. Only translated lines count; returns whether it was added. */
  noteLine(key: string, language: Language, line: OverlayLine, now = Date.now()): boolean {
    const processed = line.state === 'ready' ? line.processed : undefined
    const original = line.original.trim().slice(0, MAX_TEXT)
    if (!processed || !original) return false
    return transaction(() => {
      if (!database().prepare('SELECT 1 FROM videos WHERE id = ?').get(key)) return false
      const start = line.start ?? null
      const same = database()
        .prepare(
          `SELECT 1 FROM lines WHERE video_id = ? AND language = ? AND original = ?
             AND ((start IS NULL AND ? IS NULL) OR ABS(start - ?) < ?)`
        )
        .get(key, language, original, start, start, SAME_LINE_WITHIN_S)
      if (same) return false
      database()
        .prepare(
          'INSERT INTO lines (video_id, language, start, original, translation, processed, met_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(key, language, start, original, processed.translation, JSON.stringify(processed), now)
      return true
    })
  }

  /** Something the learner did with a word. The same event again within a minute is skipped. */
  noteWord(event: WordEvent, now = Date.now()): boolean {
    const text = event.text.trim().slice(0, MAX_TEXT)
    if (!text) return false
    const video = event.videoKey ?? null
    const recent = database()
      .prepare('SELECT 1 FROM word_events WHERE video_id IS ? AND kind = ? AND text = ? AND at > ?')
      .get(video, event.kind, text, now - SAME_EVENT_WITHIN_MS)
    if (recent) return false
    database()
      .prepare(
        'INSERT INTO word_events (video_id, language, kind, text, line, start, at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        video,
        event.language,
        event.kind,
        text,
        event.line?.slice(0, MAX_TEXT) ?? null,
        event.start ?? null,
        now
      )
    return true
  }

  /** Time the learner spent watching `key` with Duet on. Buffered; written every FLUSH_EVERY_MS. */
  addWatchTime(ms: number, key: string, now = Date.now()): void {
    if (!(ms > 0)) return
    const day = studyDay(now)
    const slot = `${key}|${day}`
    const entry = this.pending.get(slot) ?? { video: key, day, ms: 0 }
    entry.ms += ms
    this.pending.set(slot, entry)
    this.flushedAt ??= now
    if (now - this.flushedAt >= FLUSH_EVERY_MS) this.flush(now)
  }

  /** Writes buffered watch time now (every FLUSH_EVERY_MS, and when Duet quits). */
  flush(now = Date.now()): void {
    this.flushedAt = now
    if (!this.pending.size) return
    const entries = [...this.pending.values()]
    this.pending.clear()
    transaction(() => {
      for (const { video, day, ms } of entries) {
        this.ensureDay(day)
        database().prepare('UPDATE days SET watched_ms = watched_ms + ? WHERE day = ?').run(ms, day)
        database()
          .prepare('UPDATE videos SET watched_ms = watched_ms + ? WHERE id = ?')
          .run(ms, video)
      }
    })
  }

  /** The learner finished the daily session (piece 3 calls this). */
  markSessionDone(now = Date.now()): void {
    const day = studyDay(now)
    this.ensureDay(day)
    database().prepare('UPDATE days SET session_done = 1 WHERE day = ?').run(day)
  }

  /** The learner finished a checkpoint (piece 4 calls this). */
  markCheckpointDone(now = Date.now()): void {
    const day = studyDay(now)
    this.ensureDay(day)
    database()
      .prepare('UPDATE days SET checkpoints_done = checkpoints_done + 1 WHERE day = ?')
      .run(day)
  }

  /** The streak as of `now`, counting watch time not yet written. Reads the last 400 days on
   * record, so a streak counts up to about 400 days at most. */
  streak(now = Date.now()): Streak {
    this.flush(now)
    const rows = database()
      .prepare(
        'SELECT day, watched_ms, session_done, checkpoints_done FROM days ORDER BY day DESC LIMIT 400'
      )
      .all() as {
      day: string
      watched_ms: number
      session_done: number
      checkpoints_done: number
    }[]
    const records: DayRecord[] = rows.map((row) => ({
      day: row.day,
      watchedMs: row.watched_ms,
      sessionDone: row.session_done === 1,
      checkpoints: row.checkpoints_done
    }))
    return streak(records, studyDay(now))
  }

  private ensureDay(day: string): void {
    database().prepare('INSERT INTO days (day) VALUES (?) ON CONFLICT (day) DO NOTHING').run(day)
  }

  /** Keeps lines for the most recent videos only (video rows and word events stay). Runs inside
   * noteVideo's transaction. */
  private prune(): void {
    database()
      .prepare(
        'DELETE FROM lines WHERE video_id NOT IN (SELECT id FROM videos ORDER BY last_watched DESC LIMIT ?)'
      )
      .run(VIDEOS_WITH_LINES)
  }
}
