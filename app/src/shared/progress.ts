// Progress: how much of a video the learner understands, now and when they first watched it, and how
// hard its words are. Spec: docs/superpowers/specs/2026-10-16-progress-tracking-design.md.
//
// A video's score counts each word (or set phrase) of the lines met, each time it appears, weighted
// by its job (glue words and names count for nothing) and credited by its rung on the knowledge
// ladder: 100% means every word is one the learner can use. "Then" is the same words, each credited
// as it was known when first met in the video, so then and now always compare the same words. Its
// reading level is how many of the language's most common words cover 90% of its words (a frequency
// list, src/main/progress/frequency): the same rule for every language, with no model's opinion in
// it. Pure, for tests.
import { keyWord, type WordState } from './knowledge'
import type { Language, WordJob } from './types'

/** A word of a video, as the watch log tallies it: its key, the form last seen, its job, how many
 * times it was met in the video's lines, and its rung's credit when first met there (once noted). */
export type TalliedWord = {
  key: string
  text: string
  job: WordJob
  count: number
  firstCredit?: number
}

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

/** The share of a video understood, 0 to 1: now, from each word's rung today (a word with none is
 * unknown), and then, from each word's credit when first met in the video (today's, until that is
 * noted). Both over the same words, so they compare. Undefined until there are enough words to tell.
 * Words ignored now are left out of both. */
export function videoScore(
  words: TalliedWord[],
  states: Record<string, WordState>
): { now: number; then: number } | undefined {
  let weight = 0
  let now = 0
  let then = 0
  for (const word of words) {
    const state = states[word.key] ?? 'unknown'
    if (state === 'ignored') continue
    const units = word.count * JOB_WEIGHT[word.job]
    weight += units
    now += units * CREDIT[state]
    then += units * (word.firstCredit ?? CREDIT[state])
  }
  return weight >= MIN_SCORED_WEIGHT ? { now: now / weight, then: then / weight } : undefined
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
// A video is graded once its words weigh this much.
const MIN_GRADED_WEIGHT = 40
// Splitting a form with no spaces (Japanese, Korean) into listed parts: a part is at most this long,
// and a one-letter part must be this common (a particle or an ending, not a stray letter), unless it
// is a kanji (a word or part of one on its own: 他, 人).
const MAX_PART = 12
const ONE_LETTER_TOP = 100
const HAN = /\p{Script=Han}/u

const normal = (form: string): string => form.normalize('NFC').trim().toLocaleLowerCase()

/** The forms a word may be listed under: its dictionary form and the form seen, and for a Korean
 * verb or describing word, whose list keeps stems (먹, not 먹다), each without its final 하다 or 다
 * (only those: a noun such as 바다 is not 바). */
function formsOf(language: Language, word: TalliedWord): string[] {
  const forms = [keyWord(language, word.key) ?? '', normal(word.text)]
  if (language === 'ko' && (word.job === 'v' || word.job === 'a'))
    for (const form of [...forms]) {
      if (form.endsWith('하다')) forms.push(form.slice(0, -2))
      if (form.endsWith('다')) forms.push(form.slice(0, -1))
    }
  return [...new Set(forms.filter(Boolean))]
}

/** The rank of a form written with no spaces, as listed parts (the list splits Japanese and Korean
 * into short pieces: 大人になる is 大人 + に + なる): the rarest part's, splitting into as few parts as
 * it can (then the most common); undefined when it can't be split into listed parts. */
function splitRank(form: string, rankOf: RankOf): number | undefined {
  const letters = [...form]
  const best: ({ parts: number; rarest: number } | undefined)[] = [{ parts: 0, rarest: 0 }]
  for (let end = 1; end <= letters.length; end++) {
    for (let start = Math.max(0, end - MAX_PART); start < end; start++) {
      const before = best[start]
      if (!before) continue
      const rank = rankOf(letters.slice(start, end).join(''))
      const oneLetter = end - start === 1 && !HAN.test(letters[start])
      if (rank === undefined || (oneLetter && rank > ONE_LETTER_TOP)) continue
      const next = { parts: before.parts + 1, rarest: Math.max(before.rarest, rank) }
      const current = best[end]
      if (
        !current ||
        next.parts < current.parts ||
        (next.parts === current.parts && next.rarest < current.rarest)
      )
        best[end] = next
    }
  }
  return best[letters.length]?.rarest
}

/** A form's rank: as listed, or (in a language written without spaces) as listed parts; a phrase's
 * is its rarest word's. Undefined when any word isn't listed. */
function formRank(language: Language, form: string, rankOf: RankOf): number | undefined {
  let rarest = 0
  for (const part of form.split(/\s+/)) {
    const rank = rankOf(part) ?? (language === 'es' ? undefined : splitRank(part, rankOf))
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
    const rank = formRank(language, form, rankOf)
    if (rank !== undefined && (best === undefined || rank < best)) best = rank
  }
  return best
}

/** A video's reading level, from how many of the most common words cover 90% of its word weight (by
 * job: the learner's rungs play no part); undefined until its words weigh enough. A word in no list
 * counts as rarer than every listed word; one with no letters (a number) is left out. */
export function readingLevel(
  language: Language,
  words: TalliedWord[],
  rankOf: RankOf
): ReadingLevel | undefined {
  let total = 0
  const ranked: { rank: number; weight: number }[] = []
  for (const word of words) {
    const weight = word.count * JOB_WEIGHT[word.job]
    if (!weight || !/\p{L}/u.test(keyWord(language, word.key) ?? '')) continue
    total += weight
    ranked.push({ rank: unitRank(language, word, rankOf) ?? Infinity, weight })
  }
  if (total < MIN_GRADED_WEIGHT) return undefined
  ranked.sort((a, b) => a.rank - b.rank)
  let covered = 0
  let coverage = 0
  for (const unit of ranked) {
    covered += unit.weight
    coverage = unit.rank
    if (covered >= COVERAGE * total - 1e-9) break
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

/** A video's progress, in whole %: its reading level, the % now (from today's rungs), and the % then
 * (the same words, each as known when first met in the video). Each is missing until it can be told. */
export type VideoProgress = { level?: ReadingLevel; now?: number; then?: number }

/** A reading level the learner has watched: how many videos, and their average % now and then. */
export type LevelProgress = { level: ReadingLevel; videos: number; now: number; then: number }

/** Progress in a language: each video's (by its watch-log key), and each level's. */
export type ProgressSummary = { videos: Record<string, VideoProgress>; levels: LevelProgress[] }

/** Each level watched, easiest first: the average % now and then of its videos that have a %,
 * rounded down. */
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
