# Progress Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each video gets a weighted "% understood" (then and now) and a reading level 1–6 from word-frequency coverage. These show in Watching, the Continue watching tile and Your words. The strip shows none of them.

**Architecture:** Pure scoring and grading go in `src/shared/progress.ts`. The watch log owns two new tables: per-video word tallies, and per-day scores. A `Progress` class in `src/main/progress/` joins the tallies with the ladder's rungs and the bundled frequency lists, and serves one `progress:summary` IPC call to the home base.

**Tech Stack:** Electron + React + TypeScript, Node's built-in SQLite, jiti test scripts, JSON frequency lists made from wordfreq 3.1.1.

**Spec:** `docs/superpowers/specs/2026-10-16-progress-tracking-design.md`

> **Changed after review (2026-10-16):** "then" is now each word's credit when first met (no day scores or snapshots), unlisted words count as the rarest, and Japanese and Korean forms are split into listed parts. The spec is the source of truth for these; the tasks below record how the first version was built.

## Global Constraints

- Never run `prettier --write` on existing files. Edit by hand; format only new files.
- Weights: n/v/a 1, p 0.5, g/x 0; ignored rung 0. Credits: unknown/encountered 0, known 0.6, speakable 0.8, usable 1.
- A video shows a % only when Σ count × weight ≥ 15. % is rounded down.
- Grade: 90% coverage of job weight. Bands ≤500, ≤1,000, ≤2,000, ≤4,000, ≤8,000, more. Graded only when matched weight ≥ 40 and ≥ 70% of the weight.
- Always say "Reading level N" in full.
- The strip, the side panel and the daily session show no progress numbers.
- Watch-log writes that fail are reported and dropped, never thrown into watching.
- Commit messages are short plain sentences describing the effect.

## Review Focus

- A video watched in two languages: tallies and scores stay per language; the summary for one language ignores the other's.
- A line whose processed JSON is damaged (backfill): it is skipped, and backfill does not throw.
- A Korean word with no list match and a phrase with an unmatched word: left out of the grade, still in the %.
- A score asked for twice on one study day: the day row is replaced, not duplicated, and "then" stays the first day's.
- Progress failing to load in the home base: the videos still show, with no numbers and no error wall.

---

### Task 1: Frequency lists

**Files:**
- Create: `app/scripts/make-frequency-lists.py`: reads the wordfreq wheel's `large_es`, `large_ja` and `small_ko` msgpack files and writes the top 10,000 words with a letter in them, in rank order.
- Create: `app/src/main/progress/frequency/{es,ja,ko}.json` (generated, string arrays), and `app/src/main/progress/frequency/README.md` (source, version, licence CC BY-SA 4.0, how to rebuild).

- [ ] Write the script; run it with a venv that has msgpack, against the unzipped wheel.
- [ ] Check the sizes (~100–150 KB each) and spot-check the ranks (es "ir", ja "行く", ko "먹").
- [ ] Commit: "Word-frequency lists for Spanish, Japanese and Korean, from wordfreq".

### Task 2: Scoring and grading (pure)

**Files:**
- Create: `app/src/shared/progress.ts`
- Create: `app/scripts/test-progress.mjs` (pure part first)
- Modify: `app/package.json` (add `test:progress` and put it in `test`)

**Produces:**
```ts
export type TalliedWord = { key: string; text: string; job: WordJob; count: number }
export const JOB_WEIGHT: Record<WordJob, number>
export const CREDIT: Record<WordState, number>
export function videoScore(words: TalliedWord[], states: Record<string, WordState>): number | undefined // 0–1
export function percent(score: number): number // floor(score*100)
export type ReadingLevel = 1 | 2 | 3 | 4 | 5 | 6
export const LEVEL_TOPS: readonly number[] // [500, 1000, 2000, 4000, 8000]
export type RankOf = (form: string) => number | undefined // 1 = most common
export function unitRank(language: Language, word: TalliedWord, rankOf: RankOf): number | undefined
export function readingLevel(language: Language, words: TalliedWord[], rankOf: RankOf): ReadingLevel | undefined
export function levelText(level: ReadingLevel): string
export type VideoProgress = { level?: ReadingLevel; now?: number; then?: number }
export type LevelProgress = { level: ReadingLevel; videos: number; now: number; then: number }
export type ProgressSummary = { videos: Record<string, VideoProgress>; levels: LevelProgress[] }
export function levelsOf(videos: VideoProgress[]): LevelProgress[]
```

- [ ] Tests: the score with mixed rungs and jobs (hand-computed), ignored words left out, below 15 → undefined, all usable → 1.
- [ ] Tests: unitRank. Base form; the seen form when better; Korean 먹다 → 먹 and 공부하다 → 공부; a phrase takes its rarest word; a phrase with an unknown word → undefined; case and NFC.
- [ ] Tests: readingLevel. A band edge (exactly 500 → 1, 501 → 2); more than 8,000 → 6; matched weight under 40 → undefined; matched share under 70% → undefined; glue and names are not in the weight.
- [ ] Tests: levelsOf. Averages, rounded down, sorted easiest first; a video with no then uses its now; a video with no % or level is left out.
- [ ] Implement; run `node scripts/test-progress.mjs`; commit "Scores and reading levels for a video's words".

### Task 3: Tallies, backfill and day scores in the watch log

**Files:**
- Modify: `app/src/main/store/db.ts` (migration 6 as in the spec)
- Modify: `app/src/main/watchlog/index.ts`

**Produces (WatchLog):**
```ts
noteLine(...)                       // also tallies the line's words, same transaction
tallyKeptLines(): number            // once: only when video_words is empty; returns lines tallied
videoWords(key: string, language: Language): TalliedWord[]
allVideoWords(language: Language): Map<string, TalliedWord[]>
noteScore(key: string, language: Language, score: number, now?: number): void // replaces today's row
firstScores(language: Language): Map<string, { day: string; score: number }>
```

- [ ] Tests (in test-progress.mjs, temporary database): noteLine tallies counts (the same word twice in a line counts twice; a repeated line is not tallied again); per language; a damaged processed line is skipped by the backfill; the backfill runs once; noteScore on the same day replaces, a later day adds, and firstScores is the earliest.
- [ ] Implement; run the test, `npm run test:watch-log` and `npm run test:knowledge`; commit "The watch log keeps each video's words and its % by day".

### Task 4: Progress class, snapshots and IPC

**Files:**
- Create: `app/src/main/progress/frequency.ts` (`rankOf(language): RankOf`, built lazily from the JSON)
- Create: `app/src/main/progress/index.ts` (`Progress`)
- Create: `app/src/main/progress/ipc.ts` (`connectProgress`)
- Create: `app/src/preload/progress.ts`; modify `app/src/preload/index.ts`
- Modify: `app/src/main/watchlog/connect.ts` (optional `progress` dep: `snapshot` every 60 s while playing, and in `finish`)
- Modify: `app/src/main/index.ts` (wire it in)

**Produces:**
```ts
class Progress {
  constructor(deps: { log: WatchLog; knowledge: Pick<Knowledge, 'statesFor'>; rankOf?: (language: Language) => RankOf })
  snapshot(key: string, language: Language, now?: number): void
  summary(language: Language, now?: number): ProgressSummary
}
window.duet.progress.summary(language): Promise<ProgressSummary>
```
In `summary`, `then` is set only when the first score's day is before today's study day.

- [ ] Tests: snapshot then summary on the same day (no then); a word learnt the next day raises now and keeps then; the level comes from a fake rankOf; connect's tick snapshots at most once a minute while playing and not when paused.
- [ ] Implement; run the tests; typecheck; commit "Progress: each video's % then and now, and its reading level".

### Task 5: Home base UI and docs

**Files:**
- Create: `app/src/renderer/src/home/useProgress.ts` (loads the summary for the current language; reloads on `knowledge.onChanged`; an error just gives no numbers)
- Create: `app/src/renderer/src/home/progress.ts` (pure text helpers: `understoodText`, `metKnown(counts)`), tested in test-progress.mjs
- Modify: `Watching.tsx`, `tiles/WatchingTile.tsx`, `words/YourWords.tsx`, `tiles/WordsTile.tsx`, `SettingsPage.tsx`, `home.css`, `words/words.css`
- Modify: `docs/superpowers/specs/2026-10-12-duet-user-flow-design.md`

- [ ] Tests for the text helpers ("Reading level 3 · 72% understood · up from 58%"; no "up from" when equal or lower; met/known from counts).
- [ ] Implement the pages; run typecheck, lint, all tests.
- [ ] Look at it in the built app with demo data, if it can run here.
- [ ] Update the user-flow spec; commit "Watching and Your words show how much you understand".
