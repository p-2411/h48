// Progress as the home base says it: a video's reading level and how much of it is understood, a
// level's averages, and words met and known. Pure, for tests.
import { atLeast, type WordState } from '../../../shared/knowledge'
import type { LevelProgress, VideoProgress } from '../../../shared/progress'

/** "72% understood · up from 58%", or just "72% understood"; undefined with no % yet. */
export function understood(
  progress: Pick<VideoProgress, 'now' | 'then'> | undefined
): string | undefined {
  if (progress?.now === undefined) return undefined
  const up = progress.then !== undefined && progress.now > progress.then
  return `${progress.now}% understood${up ? ` · up from ${progress.then}%` : ''}`
}

/** A video's line in Watching: "Reading level 3 · 72% understood · up from 58%", as much of it as is
 * known; undefined when none is. */
export function videoLine(progress: VideoProgress | undefined): string | undefined {
  const parts = [
    progress?.level !== undefined ? `Reading level ${progress.level}` : undefined,
    understood(progress)
  ]
  const known = parts.filter((part): part is string => !!part)
  return known.length ? known.join(' · ') : undefined
}

/** A level's line under its name: "65% understood · 2 videos · up from 55%". */
export function levelLine(level: LevelProgress): string {
  const videos = `${level.videos} ${level.videos === 1 ? 'video' : 'videos'}`
  const up = level.now > level.then ? ` · up from ${level.then}%` : ''
  return `${level.now}% understood · ${videos}${up}`
}

/** Words met (every rung but ignored) and words known (known and up), from the ladder's counts. */
export function metAndKnown(counts: Record<WordState, number>): { met: number; known: number } {
  let met = 0
  let known = 0
  for (const [state, count] of Object.entries(counts) as [WordState, number][]) {
    if (state === 'ignored') continue
    met += count
    if (atLeast(state, 'known')) known += count
  }
  return { met, known }
}

/** "212 met · 49 you know". */
export function metAndKnownLine(counts: Record<WordState, number>): string {
  const { met, known } = metAndKnown(counts)
  return `${met.toLocaleString('en-US')} met · ${known.toLocaleString('en-US')} you know`
}
