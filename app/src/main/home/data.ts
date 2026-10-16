import type { HomeToday, WatchingVideo } from '../../shared/home'
import { pairKeys } from '../../shared/knowledge'
import { pairText } from '../../shared/levels'
import type { Language, ProcessedLine } from '../../shared/types'
import type { Knowledge } from '../knowledge'
import { database } from '../store/db'

/** Derive the design's summaries from saved captions; no model call or fabricated data. */
export function videoLearning(
  video: WatchingVideo,
  language: Language,
  knowledge: Knowledge
): WatchingVideo {
  const rows = database()
    .prepare(
      'SELECT original, processed, start FROM lines WHERE video_id = ? AND language = ? ORDER BY met_at DESC LIMIT 300'
    )
    .all(video.key, language) as { original: string; processed: string; start: number | null }[]
  const words = new Map<string, string>()
  for (const row of rows) {
    try {
      const line = JSON.parse(row.processed) as ProcessedLine
      for (const word of pairKeys(language, line))
        words.set(word.key, word.key.slice(language.length + 1))
    } catch {
      /* Old damaged captions are left out. */
    }
  }
  const states = knowledge.statesFor(language, [...words.keys()])
  const timed = rows.filter((row) => row.start !== null)
  const nearby =
    video.position === undefined || !timed.length
      ? rows[0]
      : timed.reduce((best, row) =>
          Math.abs(row.start! - video.position!) < Math.abs(best.start! - video.position!)
            ? row
            : best
        )
  return {
    ...video,
    subtitle: nearby?.original,
    words: [...words]
      .filter(([key]) => states[key] !== 'ignored')
      .map(([key, word]) => ({ key, word, state: states[key] ?? 'unknown' }))
  }
}

export function todayWord(language: Language, knowledge: Knowledge): HomeToday['word'] {
  const candidates = knowledge
    .summary(language)
    .words.filter((w) => w.state === 'unknown' || w.state === 'encountered')
    .slice(0, 50)
  if (!candidates.length) return undefined
  const wanted = new Set(candidates.map((word) => word.key))
  const found = new Map<string, { meaning: string; source?: string }>()
  const rows = database()
    .prepare(
      'SELECT l.processed, v.title FROM lines l JOIN videos v ON v.id = l.video_id WHERE l.language = ? ORDER BY l.met_at DESC LIMIT 300'
    )
    .all(language) as { processed: string; title: string | null }[]
  // Parse each saved caption once, even when many candidate words occur in it.
  for (const row of rows) {
    try {
      const line = JSON.parse(row.processed) as ProcessedLine
      for (const word of pairKeys(language, line)) {
        if (!wanted.has(word.key) || found.has(word.key)) continue
        const meaning = pairText(line.english, word.pair)
        if (meaning) found.set(word.key, { meaning, source: row.title ?? undefined })
      }
    } catch {
      /* Skip missing/damaged caption data. */
    }
  }
  for (const candidate of candidates) {
    const detail = found.get(candidate.key)
    if (!detail) continue
    const seen = database()
      .prepare('SELECT seen FROM words WHERE language = ? AND key = ?')
      .get(language, candidate.key) as { seen: number } | undefined
    return { ...candidate, ...detail, seen: seen?.seen ?? 0 }
  }
  return undefined
}
