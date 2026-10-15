// Progress: how much of a video the learner understands, and how hard its words are. Spec:
// docs/superpowers/specs/2026-10-16-progress-tracking-design.md.
//
// A video's score counts each word (or set phrase) of the lines met, each time it appears, weighted
// by its job (glue words and names count for nothing) and credited by its rung on the knowledge
// ladder: 100% means every word is one the learner can use. Its reading level is how many of the
// language's most common words cover 90% of its words (a frequency list, src/main/progress/
// frequency): the same rule for every language, with no model's opinion in it. Pure, for tests.
import { keyWord, type WordState } from './knowledge'
import type { Language, WordJob } from './types'

/** A word of a video, as the watch log tallies it: its key, the form last seen, its job, and how many
 * times it was met in the video's lines. */
export type TalliedWord = { key: string; text: string; job: WordJob; count: number }

/** How much a word counts, by its job: connectors and names are not what a line is about. */
export const JOB_WEIGHT: Record<WordJob, number> = { n: 1, v: 1, a: 1, p: 0.5, g: 0, x: 0 }

/** How much of a word is understood, by its rung. Seen isn't enough: only words known count. */
export const CREDIT: Record<WordState, number> = {
  unknown: 0,
  encountered: 0,
  known: 0.6,
  speakable: 0.8,
  usable: 1,
  ignored: 0
}

// A video has a score once its words weigh this much (a few lines).
const MIN_SCORED_WEIGHT = 15

/** The share of a video understood, 0 to 1, from each word's rung (a word with none is unknown);
 * undefined until there are enough words to tell. Ignored words are left out. */
export function videoScore(
  words: TalliedWord[],
  states: Record<string, WordState>
): number | undefined {
  let weight = 0
  let credit = 0
  for (const word of words) {
    const state = states[word.key] ?? 'unknown'
    if (state === 'ignored') continue
    const units = word.count * JOB_WEIGHT[word.job]
    weight += units
    credit += units * CREDIT[state]
  }
  return weight >= MIN_SCORED_WEIGHT ? credit / weight : undefined
}

/** A score as a whole %, rounded down (0.58 is 58, though 0.58 × 100 is 57.999… in floating point). */
export function percent(score: number): number {
  return Math.floor(score * 100 + 1e-9)
}

export type ReadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/** The most common words that reading levels 1 to 5 go up to; level 6 is past the last. */
export const LEVEL_TOPS = [500, 1_000, 2_000, 4_000, 8_000] as const

/** A word's rank in the language's frequency list (1 is the most common), or undefined. */
export type RankOf = (form: string) => number | undefined

// The share of a video's word weight the most common words must cover.
const COVERAGE = 0.9
// A video is graded once this much of its word weight is in the list, and at least this share of it.
const MIN_MATCHED_WEIGHT = 40
const MIN_MATCHED_SHARE = 0.7

const normal = (form: string): string => form.normalize('NFC').trim().toLocaleLowerCase()

/** The forms a word may be listed under: its dictionary form and the form seen, and in Korean, whose
 * list keeps stems (먹, not 먹다), each without its final 하다 or 다. */
function formsOf(language: Language, word: TalliedWord): string[] {
  const forms = [keyWord(language, word.key) ?? '', normal(word.text)]
  if (language === 'ko')
    for (const form of [...forms]) {
      if (form.endsWith('하다')) forms.push(form.slice(0, -2))
      if (form.endsWith('다')) forms.push(form.slice(0, -1))
    }
  return [...new Set(forms.filter(Boolean))]
}

/** A form's rank; a phrase's is its rarest word's (undefined when any word isn't listed). */
function formRank(form: string, rankOf: RankOf): number | undefined {
  const parts = form.split(/\s+/)
  let rarest = 0
  for (const part of parts) {
    const rank = rankOf(part)
    if (rank === undefined) return undefined
    rarest = Math.max(rarest, rank)
  }
  return rarest
}

/** A word's rank: the best of its forms', or undefined when none is listed. */
export function unitRank(
  language: Language,
  word: TalliedWord,
  rankOf: RankOf
): number | undefined {
  let best: number | undefined
  for (const form of formsOf(language, word)) {
    const rank = formRank(form, rankOf)
    if (rank !== undefined && (best === undefined || rank < best)) best = rank
  }
  return best
}

/** A video's reading level, from how many of the most common words cover 90% of its word weight (by
 * job: the learner's rungs play no part); undefined until enough of its words are listed. Words in
 * no list are left out. */
export function readingLevel(
  language: Language,
  words: TalliedWord[],
  rankOf: RankOf
): ReadingLevel | undefined {
  let total = 0
  const ranked: { rank: number; weight: number }[] = []
  for (const word of words) {
    const weight = word.count * JOB_WEIGHT[word.job]
    if (!weight) continue
    total += weight
    const rank = unitRank(language, word, rankOf)
    if (rank !== undefined) ranked.push({ rank, weight })
  }
  const matched = ranked.reduce((sum, unit) => sum + unit.weight, 0)
  if (matched < MIN_MATCHED_WEIGHT || matched < MIN_MATCHED_SHARE * total - 1e-9) return undefined
  ranked.sort((a, b) => a.rank - b.rank)
  let covered = 0
  let coverage = 0
  for (const unit of ranked) {
    covered += unit.weight
    coverage = unit.rank
    if (covered >= COVERAGE * matched - 1e-9) break
  }
  const band = LEVEL_TOPS.findIndex((top) => coverage <= top)
  return (band < 0 ? LEVEL_TOPS.length + 1 : band + 1) as ReadingLevel
}

/** A reading level in words. */
export function levelText(level: ReadingLevel): string {
  const most = (count: number): string => `the ${count.toLocaleString('en-US')} most common words`
  return level <= LEVEL_TOPS.length
    ? `Reading level ${level}: ${most(LEVEL_TOPS[level - 1])} cover almost all of it.`
    : `Reading level ${level}: it needs more than ${most(LEVEL_TOPS[LEVEL_TOPS.length - 1])}.`
}

/** A video's progress, in whole %: its reading level, the % now (from today's rungs), and the % when
 * it was first watched (only once that day has passed). Each is missing until it can be told. */
export type VideoProgress = { level?: ReadingLevel; now?: number; then?: number }

/** A reading level the learner has watched: how many videos, and their average % now and then. */
export type LevelProgress = { level: ReadingLevel; videos: number; now: number; then: number }

/** Progress in a language: each video's (by its watch-log key), and each level's. */
export type ProgressSummary = { videos: Record<string, VideoProgress>; levels: LevelProgress[] }

/** Each level watched, easiest first: the average % now and then of its videos that have a % (a
 * video first watched today counts its now as its then), rounded down. */
export function levelsOf(videos: VideoProgress[]): LevelProgress[] {
  const byLevel = new Map<ReadingLevel, { now: number; then: number; videos: number }>()
  for (const video of videos) {
    if (video.level === undefined || video.now === undefined) continue
    const into = byLevel.get(video.level) ?? { now: 0, then: 0, videos: 0 }
    into.now += video.now
    into.then += video.then ?? video.now
    into.videos++
    byLevel.set(video.level, into)
  }
  return [...byLevel]
    .sort(([a], [b]) => a - b)
    .map(([level, sums]) => ({
      level,
      videos: sums.videos,
      now: Math.floor(sums.now / sums.videos),
      then: Math.floor(sums.then / sums.videos)
    }))
}
