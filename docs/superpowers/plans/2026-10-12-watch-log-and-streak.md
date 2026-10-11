# Watch Log and Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what the learner watches with Duet (videos, lines met, word events, study days) in the local database, and work out the streak from it.

**Architecture:** A new database migration adds four tables. `WatchLog` (src/main/watchlog/index.ts) is the only code that reads or writes them. A pure `streak()` (src/main/watchlog/streak.ts) turns day records into the streak. `connectWatchLog` (src/main/watchlog/connect.ts) feeds the log from the watcher, the player, card saves, Explain and the strip's word hover. Nothing new shows on screen in this piece; the home base (piece 2) reads it.

**Tech Stack:** Electron main process, TypeScript, Node's built-in SQLite (`node:sqlite` via src/main/store/db.ts), React for the one renderer change, tests as plain `.mjs` scripts run with jiti (`npm test`).

**Spec:** docs/superpowers/specs/2026-10-12-duet-user-flow-design.md (section 5, "The streak" in section 3)

All paths below are relative to `app/` unless they start with `docs/`.

## Global Constraints

- All data stays on the learner's Mac, in the existing local database. Duet never keeps audio.
- The schema only moves forward: add migration 2; never edit migration 1.
- A study day rolls over at 04:00 local time (the same day the review scheduler uses).
- Lines are kept for the last ~30 videos (`VIDEOS_WITH_LINES = 30`); video rows and word events are kept.
- A word hover counts only after ~300 ms on the word.
- The streak: a day is kept by finishing the daily session, OR finishing a checkpoint, OR 10 minutes in total that day with a video playing and Duet on. Two automatic freezes a week (Monday to Sunday). Today never breaks the streak.
- Code style: match the surrounding code (comment density, plain-English comments that say why, Prettier, ESLint with explicit return types). Run `npx prettier --write` on changed files.
- Commit only when the user asks; the commit steps below are where commits go once they do.

## Review Focus

1. **The 04:00 rollover.** Watching at 03:30 belongs to the day before; a learner up late should not lose or split a streak day. Test in Task 4.
2. **Rewatching and caption timing jitter.** A line met again on a rewatch, or read from captions with a start a second off, is the same line: no duplicate rows. Test in Task 3.
3. **Moving the mouse across words.** Passing over a word is not a hover, and hovering the same word again within a minute is one event. The 300 ms dwell is in Task 6; the one-minute merge is tested in Task 3.
4. **Sleep or a long stall between ticks.** A laptop asleep with a paused-looking player, or a gap of minutes between ticks, must not count as watching. Test in Task 5.
5. **Quitting mid-video.** Watch time is buffered; at most 15 s is lost, and quitting flushes it. Test in Task 5.
6. **A hover message with text that isn't in the line.** The renderer is not trusted to name arbitrary words; main checks the word is in that line. Test in Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `src/main/study-day.ts` (new) | The study day (04:00 rollover). Moved out of cards/review.ts so the watch log and the scheduler share one rule |
| `src/main/cards/review.ts` (modify) | Imports the study day instead of defining it |
| `src/main/watchlog/streak.ts` (new) | Pure streak rule: which days are kept, freezes, the count |
| `src/main/store/db.ts` (modify) | Migration 2: `videos`, `lines`, `word_events`, `days` |
| `src/main/watchlog/index.ts` (new) | `WatchLog`: every read and write of the four tables |
| `src/main/watchlog/connect.ts` (new) | `connectWatchLog`: feeds the log from the watcher, player, cards, Explain and hover |
| `src/main/cards/index.ts` (modify) | Emits `saved` with the new card |
| `src/main/watcher.ts` (modify) | `currentVideo` also gives the URL and title |
| `src/main/ipc/overlay.ts`, `src/preload/overlay.ts` (modify) | `duet:hovered-word` |
| `src/renderer/src/overlay/LineView.tsx` (modify) | Sends a hover after 300 ms on a word |
| `src/main/index.ts` (modify) | Creates the log, wires it, ticks it, flushes it on quit |
| `scripts/test-watch-log.mjs` (new), `package.json` (modify) | Tests; added to `npm test` |

---

### Task 1: One study-day rule

**Files:**
- Create: `src/main/study-day.ts`
- Modify: `src/main/cards/review.ts:19-41` (remove `ROLLOVER_HOUR`, `studyDayStart`, `studyDay`, `studyDayEnd`; import them)
- Test: `scripts/test-watch-log.mjs` (new), `package.json`

**Interfaces:**
- Produces: `studyDay(now: number): string` (YYYY-MM-DD), `studyDayEnd(now: number): number` (ms)

- [ ] **Step 1: Write the failing test**

Create `scripts/test-watch-log.mjs`:

```js
// Tests the watch log and the streak (src/main/watchlog) on a temporary database, with a small
// fake "electron" module for the app's data folder. Run: npx jiti scripts/test-watch-log.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-watch-log-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(fakeElectron, `module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, is: { dev: false } }\n`)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})
const root = resolve('src/main')
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

try {
  // --- The study day rolls over at 04:00 ---------------------------------------------------
  const { studyDay, studyDayEnd } = await jiti.import(join(root, 'study-day.ts'))
  assert.equal(studyDay(at(2026, 10, 12, 3, 59)), '2026-10-11', '03:59 still belongs to the day before')
  assert.equal(studyDay(at(2026, 10, 12, 4, 0)), '2026-10-12', '04:00 starts the new day')
  assert.equal(studyDayEnd(at(2026, 10, 12, 23, 0)), at(2026, 10, 13, 4, 0))

  console.log('Watch log tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
```

Add to `package.json` scripts: `"test:watch-log": "jiti scripts/test-watch-log.mjs"`, and append ` && npm run test:watch-log` to `"test"`.

- [ ] **Step 2: Run the test to see it fail**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: FAIL, cannot find module `src/main/study-day.ts`.

- [ ] **Step 3: Move the study day**

Create `src/main/study-day.ts`:

```ts
// The study day: a day of learning runs from 04:00 to 04:00 local time, so a late night counts
// toward the day it started. The review scheduler's daily counts and the streak both go by it.
const ROLLOVER_HOUR = 4

function studyDayStart(now: number): Date {
  const start = new Date(now)
  if (start.getHours() < ROLLOVER_HOUR) start.setDate(start.getDate() - 1)
  start.setHours(ROLLOVER_HOUR, 0, 0, 0)
  return start
}

/** The study day `now` falls in, as YYYY-MM-DD. */
export function studyDay(now: number): string {
  const start = studyDayStart(now)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

/** When the study day `now` falls in ends, in ms since 1970. */
export function studyDayEnd(now: number): number {
  const end = studyDayStart(now)
  end.setDate(end.getDate() + 1)
  return end.getTime()
}
```

In `src/main/cards/review.ts`, delete `const ROLLOVER_HOUR = 4`, `studyDayStart`, `studyDay` and `studyDayEnd` (lines ~19-41), and add:

```ts
import { studyDay, studyDayEnd } from '../study-day'
```

If anything imported `studyDay` from `./review`, point it at `../study-day` (today nothing outside review.ts does; check with `grep -rn studyDay src scripts`).

- [ ] **Step 4: Run the tests**

Run: `npx jiti scripts/test-watch-log.mjs && npm run typecheck && npm test`
Expected: "Watch log tests passed." and every suite passes (the review suites prove the move kept behaviour).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/study-day.ts app/src/main/cards/review.ts app/scripts/test-watch-log.mjs app/package.json
git commit -m "One study-day rule for the review scheduler and the watch log"
```

---

### Task 2: The streak rule

**Files:**
- Create: `src/main/watchlog/streak.ts`
- Test: `scripts/test-watch-log.mjs`

**Interfaces:**
- Produces:
  - `type DayRecord = { day: string; watchedMs: number; sessionDone: boolean; checkpoints: number }`
  - `type Streak = { days: number; keptToday: boolean; freezesLeft: number }`
  - `WATCH_MS_FOR_A_DAY = 600_000`, `FREEZES_PER_WEEK = 2`
  - `kept(record: DayRecord): boolean`
  - `addDays(day: string, days: number): string`, `weekOf(day: string): string`
  - `streak(records: DayRecord[], today: string): Streak`

- [ ] **Step 1: Write the failing tests**

In `scripts/test-watch-log.mjs`, before `console.log('Watch log tests passed.')`, add:

```js
  // --- The streak ----------------------------------------------------------------------------
  const { streak, kept, weekOf, addDays } = await jiti.import(join(root, 'watchlog/streak.ts'))
  const day = (date, change = {}) => ({ day: date, watchedMs: 0, sessionDone: false, checkpoints: 0, ...change })
  const done = (date) => day(date, { sessionDone: true })
  // 2026-10-12 is a Monday.
  assert.equal(weekOf('2026-10-14'), '2026-10-12')
  assert.equal(weekOf('2026-10-18'), '2026-10-12', 'Sunday is the last day of the week')
  assert.equal(weekOf('2026-10-19'), '2026-10-19')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-03-29', -1), '2026-03-28', 'date steps ignore clock changes')

  assert.equal(kept(day('2026-10-12', { watchedMs: 9 * 60_000 })), false, '9 minutes watched does not keep a day')
  assert.equal(kept(day('2026-10-12', { watchedMs: 10 * 60_000 })), true, '10 minutes watched keeps a day')
  assert.equal(kept(day('2026-10-12', { checkpoints: 1 })), true, 'a checkpoint keeps a day')
  assert.equal(kept(done('2026-10-12')), true, 'the daily session keeps a day')

  assert.deepEqual(streak([], '2026-10-14'), { days: 0, keptToday: false, freezesLeft: 2 }, 'no days, no streak')
  assert.deepEqual(streak([done('2026-10-14')], '2026-10-14'), { days: 1, keptToday: true, freezesLeft: 2 })
  assert.deepEqual(
    streak([done('2026-10-13')], '2026-10-14'),
    { days: 1, keptToday: false, freezesLeft: 2 },
    'today not kept yet does not break the streak'
  )
  // Mon, Tue kept; Wed missed (a freeze); Thu kept; today Fri not yet.
  assert.deepEqual(
    streak([done('2026-10-12'), done('2026-10-13'), done('2026-10-15')], '2026-10-16'),
    { days: 3, keptToday: false, freezesLeft: 1 }
  )
  // Mon kept; Tue, Wed, Thu missed: the third miss in one week breaks it.
  assert.equal(streak([done('2026-10-12')], '2026-10-16').days, 0)
  // Freezes are per week: Sat 10-10 kept, Sun 10-11 missed (last week's freeze), Mon and Tue missed
  // (this week's two), Wed kept today.
  assert.deepEqual(streak([done('2026-10-10'), done('2026-10-14')], '2026-10-14'), { days: 2, keptToday: true, freezesLeft: 0 })
  // Days not kept in the records (watched 2 minutes) count as missed.
  assert.equal(streak([done('2026-10-12'), day('2026-10-13', { watchedMs: 120_000 }), done('2026-10-14')], '2026-10-14').days, 2)
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: FAIL, cannot find module `watchlog/streak.ts`.

- [ ] **Step 3: Write the streak rule**

Create `src/main/watchlog/streak.ts`:

```ts
// The streak: how many study days in a row the learner kept. A day is kept by finishing the daily
// session, finishing a checkpoint, or watching 10 minutes with Duet. Each week (Monday to Sunday)
// forgives up to two missed days on its own (freezes), so a missed day costs nothing; a third miss
// in one week ends the streak. Today never breaks it: until today is kept, it runs to yesterday.
// Days are study days (YYYY-MM-DD, see study-day.ts); date steps are done in UTC so clock changes
// don't skip or repeat a day.

export const WATCH_MS_FOR_A_DAY = 10 * 60_000
export const FREEZES_PER_WEEK = 2

export type DayRecord = { day: string; watchedMs: number; sessionDone: boolean; checkpoints: number }
export type Streak = { days: number; keptToday: boolean; freezesLeft: number }

/** Whether the learner kept this day. */
export function kept(record: DayRecord): boolean {
  return record.sessionDone || record.checkpoints > 0 || record.watchedMs >= WATCH_MS_FOR_A_DAY
}

function parse(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

/** The day `days` days after `day` (before it, when negative). */
export function addDays(day: string, days: number): string {
  const date = parse(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The Monday that starts `day`'s week. */
export function weekOf(day: string): string {
  const sinceMonday = (parse(day).getUTCDay() + 6) % 7
  return addDays(day, -sinceMonday)
}

/** The streak as of `today`, from the days on record (days with no record were missed). */
export function streak(records: DayRecord[], today: string): Streak {
  const keptDays = new Set(records.filter(kept).map((record) => record.day))
  const keptToday = keptDays.has(today)
  const freezesUsed = new Map<string, number>()
  const first = [...keptDays].sort()[0]
  let days = 0
  for (let day = keptToday ? today : addDays(today, -1); first && day >= first; day = addDays(day, -1)) {
    if (keptDays.has(day)) {
      days++
      continue
    }
    const week = weekOf(day)
    const used = freezesUsed.get(week) ?? 0
    if (used >= FREEZES_PER_WEEK) break
    freezesUsed.set(week, used + 1)
  }
  return { days, keptToday, freezesLeft: FREEZES_PER_WEEK - (freezesUsed.get(weekOf(today)) ?? 0) }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: "Watch log tests passed."

- [ ] **Step 5: Commit**

```bash
git add app/src/main/watchlog/streak.ts app/scripts/test-watch-log.mjs
git commit -m "The streak rule: kept days, two freezes a week"
```

---

### Task 3: The tables and the log of videos, lines and words

**Files:**
- Modify: `src/main/store/db.ts` (append migration 2 to `MIGRATIONS`; update the file's top comment to mention the watch log)
- Create: `src/main/watchlog/index.ts`
- Test: `scripts/test-watch-log.mjs`

**Interfaces:**
- Consumes: `studyDay` (Task 1); `streak`, `DayRecord`, `Streak` (Task 2); `database`, `transaction` from `src/main/store/db.ts`; `Language`, `OverlayLine`, `Site` from `src/shared/types.ts`
- Produces (in `src/main/watchlog/index.ts`):
  - `VIDEOS_WITH_LINES = 30`
  - `type WatchedVideo = { site: Site; id: string; url: string; title?: string }`
  - `type WordEventKind = 'hovered' | 'saved' | 'explained' | 'missed'`
  - `type WordEvent = { kind: WordEventKind; videoKey?: string; language: Language; text: string; line?: string; start?: number }`
  - `videoKey(video: { site: Site; id: string }): string`
  - `class WatchLog` with `noteVideo(video: WatchedVideo, language: Language, position: number | undefined, now?: number): void`, `noteLine(key: string, language: Language, line: OverlayLine, now?: number): boolean`, `noteWord(event: WordEvent, now?: number): boolean`, and (Task 4) `addWatchTime`, `flush`, `markSessionDone`, `markCheckpointDone`, `streak`

- [ ] **Step 1: Write the failing tests**

In `scripts/test-watch-log.mjs`, before `console.log(...)`, add:

```js
  // --- Videos, lines and words ----------------------------------------------------------------
  const { WatchLog, videoKey, VIDEOS_WITH_LINES } = await jiti.import(join(root, 'watchlog/index.ts'))
  const { database } = await jiti.import(join(root, 'store/db.ts'))
  const log = new WatchLog()
  const video = { site: 'youtube', id: 'abc', url: 'https://www.youtube.com/watch?v=abc' }
  const key = videoKey(video)
  assert.equal(key, 'youtube:abc')
  const count = (sql, ...args) => database().prepare(sql).get(...args).n

  log.noteVideo(video, 'ko', 12, at(2026, 10, 12))
  log.noteVideo({ ...video, title: 'Sintel' }, 'ko', 40, at(2026, 10, 12, 12, 5))
  log.noteVideo(video, 'ko', undefined, at(2026, 10, 12, 12, 6))
  const row = database().prepare('SELECT * FROM videos WHERE id = ?').get(key)
  assert.equal(count('SELECT COUNT(*) n FROM videos'), 1, 'one row per video')
  assert.equal(row.title, 'Sintel', 'a title once known is kept when a later update has none')
  assert.equal(row.position, 40, 'an unknown place keeps the last known one')
  assert.equal(row.last_watched, at(2026, 10, 12, 12, 6))

  const line = (original, start, extra = {}) => ({ id: 1, original, at: 0, start, state: 'ready', processed: { translation: 'Hello', source: [], english: [] }, ...extra })
  assert.equal(log.noteLine(key, 'ko', line('안녕하세요', 105.2)), true)
  assert.equal(log.noteLine(key, 'ko', line('안녕하세요', 106.4)), false, 'the same line a second off (caption timing) is not added twice')
  assert.equal(log.noteLine(key, 'ko', line('안녕하세요', 300)), true, 'the same words later in the video are another line')
  assert.equal(log.noteLine(key, 'ko', line('네', undefined)), true)
  assert.equal(log.noteLine(key, 'ko', line('네', undefined)), false, 'a line with no start is not added twice')
  assert.equal(log.noteLine(key, 'ko', line('기다려', 10, { state: 'pending', processed: undefined })), false, 'a line not yet translated is not met')
  assert.equal(log.noteLine('youtube:never-noted', 'ko', line('왜', 1)), false, 'a line for a video not on record is skipped')
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', key), 3)

  const word = { kind: 'hovered', videoKey: key, language: 'ko', text: '친구', line: '친구랑 봤어요', start: 12 }
  assert.equal(log.noteWord(word, at(2026, 10, 12, 12, 0)), true)
  assert.equal(log.noteWord(word, at(2026, 10, 12, 12, 0) + 30_000), false, 'the same hover within a minute is one event')
  assert.equal(log.noteWord(word, at(2026, 10, 12, 12, 2)), true, 'a hover a minute later is a new event')
  assert.equal(log.noteWord({ ...word, kind: 'saved' }, at(2026, 10, 12, 12, 2)), true, 'another kind is another event')
  assert.equal(log.noteWord({ ...word, text: '   ' }), false, 'an empty word is skipped')
  assert.equal(log.noteWord({ kind: 'saved', language: 'ko', text: '사랑' }), true, 'a card not from a video has no video')

  // Lines are kept for the most recent VIDEOS_WITH_LINES videos; their video rows stay.
  for (let index = 0; index < VIDEOS_WITH_LINES; index++) {
    const other = { site: 'youtube', id: `v${index}`, url: `https://www.youtube.com/watch?v=v${index}` }
    log.noteVideo(other, 'ko', 0, at(2026, 10, 13, 12, index))
    log.noteLine(videoKey(other), 'ko', line(`줄 ${index}`, 1))
  }
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', key), 0, 'the oldest video loses its lines')
  assert.equal(count('SELECT COUNT(*) n FROM videos WHERE id = ?', key), 1, '...but stays in the list of videos')
  assert.equal(count('SELECT COUNT(DISTINCT video_id) n FROM lines'), VIDEOS_WITH_LINES)
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: FAIL, cannot find module `watchlog/index.ts`.

- [ ] **Step 3: Add migration 2**

In `src/main/store/db.ts`, change the top comment's second sentence to: "Everything the learner keeps lives here: settings, cards and their review history, and the watch log (src/main/watchlog)." Append this string to `MIGRATIONS` (after migration 1):

```ts
  // 2: the watch log: videos watched, lines met, what the learner did with words, and each study
  // day's activity (for the daily session, checkpoints and the streak).
  `
  CREATE TABLE videos (
    id            TEXT PRIMARY KEY,  -- site:videoId, e.g. youtube:eRsGyueVLvQ
    site          TEXT NOT NULL,
    url           TEXT NOT NULL,
    title         TEXT,
    language      TEXT NOT NULL,     -- the language being learnt when last watched
    position      REAL,              -- seconds into the video where the learner left off
    watched_ms    INTEGER NOT NULL DEFAULT 0,
    first_watched INTEGER NOT NULL,
    last_watched  INTEGER NOT NULL
  );
  CREATE INDEX videos_recent ON videos (last_watched);

  -- Lines the learner met (on screen and translated), for the most recent videos only.
  CREATE TABLE lines (
    id          INTEGER PRIMARY KEY,
    video_id    TEXT NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
    language    TEXT NOT NULL,
    start       REAL,              -- seconds into the video, when known
    original    TEXT NOT NULL,
    translation TEXT,
    processed   TEXT,              -- JSON: the processed line (translation and word pairs)
    met_at      INTEGER NOT NULL
  );
  CREATE INDEX lines_video ON lines (video_id, original);

  CREATE TABLE word_events (
    id        INTEGER PRIMARY KEY,
    video_id  TEXT,                -- null for a card not from a video
    language  TEXT NOT NULL,
    kind      TEXT NOT NULL CHECK (kind IN ('hovered', 'saved', 'explained', 'missed')),
    text      TEXT NOT NULL,       -- the word or expression; the whole line for 'explained'
    line      TEXT,                -- the line it was in
    start     REAL,                -- where that line is in the video, when known
    at        INTEGER NOT NULL
  );
  CREATE INDEX word_events_recent ON word_events (video_id, kind, text, at);

  CREATE TABLE days (
    day              TEXT PRIMARY KEY,  -- the study day (rolls over at 04:00)
    watched_ms       INTEGER NOT NULL DEFAULT 0,
    session_done     INTEGER NOT NULL DEFAULT 0,
    checkpoints_done INTEGER NOT NULL DEFAULT 0
  );
  `
```

- [ ] **Step 4: Write `WatchLog` (videos, lines, words)**

Create `src/main/watchlog/index.ts`:

```ts
// The watch log: what the learner watched with Duet, kept on this Mac. Videos (for Watching), the
// lines met in each (for checkpoints and the daily "say the line"), what the learner did with
// words (hovered, saved, explained, missed in a checkpoint) and each study day's activity (for the
// streak). This class is the only code that touches those tables; connect.ts feeds it.
import type { Language, OverlayLine, Site } from '../../shared/types'
import { database, transaction } from '../store/db'

// Lines are kept for this many of the most recently watched videos.
export const VIDEOS_WITH_LINES = 30
// The same words met again this close (seconds) are the same line: caption timing drifts a little.
const SAME_LINE_WITHIN_S = 3
// The same word event again this soon is one event (the pointer going back and forth over a word).
const SAME_EVENT_WITHIN_MS = 60_000
// Words and lines longer than this are not words or lines (a bad message); they are cut.
const MAX_TEXT = 500

export type WatchedVideo = { site: Site; id: string; url: string; title?: string }
export type WordEventKind = 'hovered' | 'saved' | 'explained' | 'missed'
export type WordEvent = { kind: WordEventKind; videoKey?: string; language: Language; text: string; line?: string; start?: number }

/** The key a video is stored under: its site and the site's id for it. */
export function videoKey(video: { site: Site; id: string }): string {
  return `${video.site}:${video.id}`
}

export class WatchLog {
  /** The video on screen: added, or brought up to date (URL, title, language, where it is). */
  noteVideo(video: WatchedVideo, language: Language, position: number | undefined, now = Date.now()): void {
    const key = videoKey(video)
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

  /** A line the learner met. Only translated lines count; returns whether it was added. */
  noteLine(key: string, language: Language, line: OverlayLine, now = Date.now()): boolean {
    if (line.state !== 'ready' || !line.processed) return false
    const original = line.original.trim().slice(0, MAX_TEXT)
    if (!original) return false
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
        .prepare('INSERT INTO lines (video_id, language, start, original, translation, processed, met_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(key, language, start, original, line.processed!.translation, JSON.stringify(line.processed), now)
      return true
    })
  }

  /** Something the learner did with a word. The same event again within a minute is skipped. */
  noteWord(event: WordEvent, now = Date.now()): boolean {
    const text = event.text.trim().slice(0, MAX_TEXT)
    if (!text) return false
    const video = event.videoKey ?? null
    const recent = database()
      .prepare(
        `SELECT 1 FROM word_events WHERE video_id IS ? AND kind = ? AND text = ? AND at > ?`
      )
      .get(video, event.kind, text, now - SAME_EVENT_WITHIN_MS)
    if (recent) return false
    database()
      .prepare('INSERT INTO word_events (video_id, language, kind, text, line, start, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(video, event.language, event.kind, text, event.line?.slice(0, MAX_TEXT) ?? null, event.start ?? null, now)
    return true
  }

  /** Keeps lines for the most recent videos only (video rows and word events stay). */
  private prune(): void {
    database()
      .prepare(
        `DELETE FROM lines WHERE video_id NOT IN (SELECT id FROM videos ORDER BY last_watched DESC LIMIT ?)`
      )
      .run(VIDEOS_WITH_LINES)
  }
}
```

Note: `transaction` in db.ts uses `BEGIN IMMEDIATE`, so do not call `transaction` inside another `transaction`. `prune` runs inside `noteVideo`'s transaction and does not open its own.

- [ ] **Step 5: Run the tests**

Run: `npx prettier --write src/main/watchlog/index.ts src/main/store/db.ts && npx jiti scripts/test-watch-log.mjs && npm run typecheck`
Expected: "Watch log tests passed.", no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/store/db.ts app/src/main/watchlog/index.ts app/scripts/test-watch-log.mjs
git commit -m "Watch log: videos, lines met and word events, with lines kept for the last 30 videos"
```

---

### Task 4: Days, watch time and the streak from the log

**Files:**
- Modify: `src/main/watchlog/index.ts`
- Test: `scripts/test-watch-log.mjs`

**Interfaces:**
- Consumes: `studyDay` (Task 1), `streak`, `Streak`, `DayRecord` (Task 2)
- Produces (on `WatchLog`):
  - `addWatchTime(ms: number, key: string, now?: number): void` (buffered)
  - `flush(now?: number): void`
  - `markSessionDone(now?: number): void`
  - `markCheckpointDone(now?: number): void`
  - `streak(now?: number): Streak`
  - `FLUSH_EVERY_MS = 15_000` (exported)

- [ ] **Step 1: Write the failing tests**

In `scripts/test-watch-log.mjs`, before `console.log(...)`, add:

```js
  // --- Days, watch time and the streak ---------------------------------------------------------
  const { FLUSH_EVERY_MS } = await jiti.import(join(root, 'watchlog/index.ts'))
  const days = new WatchLog()
  const dayRow = (date) => database().prepare('SELECT * FROM days WHERE day = ?').get(date)
  const start = at(2026, 10, 20, 20, 0)
  days.addWatchTime(4 * 60_000, key, start)
  assert.equal(dayRow('2026-10-20'), undefined, 'watch time is buffered, not written every tick')
  days.addWatchTime(6 * 60_000, key, start + FLUSH_EVERY_MS)
  assert.equal(dayRow('2026-10-20').watched_ms, 10 * 60_000, 'buffered time is written every 15 s')
  assert.equal(database().prepare('SELECT watched_ms n FROM videos WHERE id = ?').get(key).n, 10 * 60_000, '...to the video too')
  assert.deepEqual(days.streak(start + FLUSH_EVERY_MS), { days: 1, keptToday: true, freezesLeft: 2 }, '10 minutes keeps the day')

  days.addWatchTime(60_000, key, at(2026, 10, 21, 3, 30))
  days.flush(at(2026, 10, 21, 3, 30))
  assert.equal(dayRow('2026-10-20').watched_ms, 11 * 60_000, 'watching at 03:30 counts for the day before')
  assert.equal(dayRow('2026-10-21'), undefined)

  days.addWatchTime(30_000, key, at(2026, 10, 21, 20, 0))
  days.flush(at(2026, 10, 21, 20, 0))
  assert.equal(dayRow('2026-10-21').watched_ms, 30_000, 'flush writes what is buffered (quitting mid-video)')

  days.markCheckpointDone(at(2026, 10, 22, 9, 0))
  days.markSessionDone(at(2026, 10, 23, 9, 0))
  assert.equal(dayRow('2026-10-22').checkpoints_done, 1)
  assert.equal(dayRow('2026-10-23').session_done, 1)
  // 20th kept (watched), 21st missed (a freeze), 22nd checkpoint, 23rd session.
  assert.deepEqual(days.streak(at(2026, 10, 23, 10, 0)), { days: 3, keptToday: true, freezesLeft: 1 })
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: FAIL, `days.addWatchTime is not a function`.

- [ ] **Step 3: Add days to `WatchLog`**

In `src/main/watchlog/index.ts`, add the imports and constant:

```ts
import { studyDay } from '../study-day'
import { streak, type DayRecord, type Streak } from './streak'

// Watch time is written this often (and on quit), not on every tick.
export const FLUSH_EVERY_MS = 15_000
```

Add to the class (fields at the top, methods after `noteWord`):

```ts
  // Watch time not yet written, by video and by study day, and when it was last written.
  private pending = new Map<string, { video: string; day: string; ms: number }>()
  private flushedAt?: number

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
        database().prepare('UPDATE videos SET watched_ms = watched_ms + ? WHERE id = ?').run(ms, video)
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
    database().prepare('UPDATE days SET checkpoints_done = checkpoints_done + 1 WHERE day = ?').run(day)
  }

  /** The streak as of `now`, including watch time not yet written. */
  streak(now = Date.now()): Streak {
    this.flush(now)
    const rows = database()
      .prepare('SELECT day, watched_ms, session_done, checkpoints_done FROM days ORDER BY day DESC LIMIT 400')
      .all() as { day: string; watched_ms: number; session_done: number; checkpoints_done: number }[]
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
```

(The `LIMIT 400` bounds the read: a streak longer than about a year still counts, because each kept day in the chain is in the most recent 400 rows.)

- [ ] **Step 4: Run the tests**

Run: `npx prettier --write src/main/watchlog/index.ts && npx jiti scripts/test-watch-log.mjs && npm run typecheck`
Expected: "Watch log tests passed."

- [ ] **Step 5: Commit**

```bash
git add app/src/main/watchlog/index.ts app/scripts/test-watch-log.mjs
git commit -m "Watch log: study days, buffered watch time and the streak"
```

---

### Task 5: Feeding the log from the watcher, player, cards and Explain

**Files:**
- Create: `src/main/watchlog/connect.ts`
- Modify: `src/main/watcher.ts` (`currentVideo` getter)
- Modify: `src/main/cards/index.ts` (`saveDraft` emits `saved`; header comment lists the event)
- Modify: `src/main/index.ts` (create, wire, tick, flush on quit)
- Test: `scripts/test-watch-log.mjs`

**Interfaces:**
- Consumes: `WatchLog`, `videoKey`, `WatchedVideo` (Tasks 3-4)
- Produces:
  - `Watcher.currentVideo: { site: Site; id: string; url: string; title?: string } | undefined` (was `{ site; id }`; existing callers only read `site`/`id`)
  - `Cards` emits `'saved'` with the `Card` when `saveDraft` saves a new card (not on a duplicate)
  - `connectWatchLog(log: WatchLog, deps: { watcher: WatchSource; player: { playing: boolean; now(): number | undefined }; settings: { current: { language: Language } }; cards: EventEmitter }): WatchLogLink`
  - `type WatchLogLink = { tick(now?: number): void; explained(moment: Moment): void; hovered(lineId: number, text: string): void }` (`hovered` is filled in by Task 6; this task makes it a no-op stub that Task 6 replaces)
  - `type WatchSource = EventEmitter & { currentVideo?: WatchedVideo; currentLine?: OverlayLine; moment(lineId?: number): Moment | undefined }`
  - `MAX_TICK_MS = 1_000` (exported): a gap between ticks longer than this counts as this much

- [ ] **Step 1: Write the failing tests**

In `scripts/test-watch-log.mjs`, before `console.log(...)`, add:

```js
  // --- Feeding the log -------------------------------------------------------------------------
  const { EventEmitter } = await import('node:events')
  const { connectWatchLog, MAX_TICK_MS } = await jiti.import(join(root, 'watchlog/connect.ts'))
  const fed = new WatchLog()
  const watcher = Object.assign(new EventEmitter(), {
    currentVideo: { site: 'youtube', id: 'fed', url: 'https://www.youtube.com/watch?v=fed', title: 'Fed' },
    currentLine: undefined,
    moment: () => undefined
  })
  const player = { playing: true, now: () => 50 }
  const cards = new EventEmitter()
  const link = connectWatchLog(fed, { watcher, player, settings: { current: { language: 'ko' } }, cards })
  const t0 = at(2026, 11, 2, 20, 0)
  link.tick(t0)
  link.tick(t0 + 100)
  link.tick(t0 + 100 + 5 * 60_000) // the laptop slept: counts as MAX_TICK_MS, not 5 minutes
  player.playing = false
  link.tick(t0 + 100 + 5 * 60_000 + 100) // paused: does not count
  fed.flush(t0 + 100 + 5 * 60_000 + 100)
  assert.equal(database().prepare('SELECT watched_ms n FROM days WHERE day = ?').get('2026-11-02').n, 100 + MAX_TICK_MS)
  assert.equal(database().prepare('SELECT title FROM videos WHERE id = ?').get('youtube:fed').title, 'Fed', 'the video on screen is on record')

  // A translated line that comes on screen is met.
  const shown = line('저는 어제 영화를 봤어요', 61)
  watcher.currentLine = shown
  watcher.emit('current', shown.id)
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', 'youtube:fed'), 1)
  // A line still translating when it comes on screen is met once it is translated.
  const late = line('늦었어요', 70, { id: 2, state: 'pending', processed: undefined })
  watcher.currentLine = late
  watcher.emit('current', late.id)
  const ready = { ...late, state: 'ready', processed: { translation: "I'm late", source: [], english: [] } }
  watcher.currentLine = ready
  watcher.emit('line', ready)
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', 'youtube:fed'), 2)

  // Saving a card from a video logs the word with its video; a card not from a video, without.
  const moment = { language: 'ko', line: shown, earlier: [], video: { site: 'youtube', id: 'fed', position: 61 }, takenAt: 0 }
  cards.emit('saved', { language: 'ko', expression: '영화', source: { kind: 'video', moment } })
  cards.emit('saved', { language: 'ko', expression: '사랑해', source: { kind: 'tutor' } })
  assert.equal(count("SELECT COUNT(*) n FROM word_events WHERE kind = 'saved' AND video_id = 'youtube:fed' AND text = '영화'"), 1)
  assert.equal(count("SELECT COUNT(*) n FROM word_events WHERE kind = 'saved' AND video_id IS NULL AND text = '사랑해'"), 1)
  // Explaining a line logs it.
  link.explained(moment)
  assert.equal(count("SELECT COUNT(*) n FROM word_events WHERE kind = 'explained' AND text = '저는 어제 영화를 봤어요'"), 1)
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: FAIL, cannot find module `watchlog/connect.ts`.

- [ ] **Step 3: Write `connectWatchLog`**

Create `src/main/watchlog/connect.ts`:

```ts
// Feeds the watch log: the video on screen and where it is, time spent watching (only while the
// video plays), lines as they come on screen translated, cards saved, lines explained and words
// hovered on the strip. index.ts calls tick() from its main loop and flushes the log on quit.
import type { EventEmitter } from 'events'
import type { Card } from '../../shared/cards'
import type { Moment } from '../../shared/moment'
import type { Language, OverlayLine } from '../../shared/types'
import { videoKey, type WatchedVideo, type WatchLog } from '.'

// A gap between ticks longer than this (the Mac slept, the loop stalled) counts as this much.
export const MAX_TICK_MS = 1_000
// How often the video's record (title, where it is) is brought up to date.
const VIDEO_EVERY_MS = 15_000

export type WatchSource = EventEmitter & {
  currentVideo?: WatchedVideo
  currentLine?: OverlayLine
  moment(lineId?: number): Moment | undefined
}

export type WatchLogLink = {
  /** Call often (index.ts's main loop): counts watch time and keeps the video's record current. */
  tick(now?: number): void
  /** The learner opened Explain on a moment. */
  explained(moment: Moment): void
  /** The learner rested the pointer on a word of a line on the strip. */
  hovered(lineId: number, text: string): void
}

export function connectWatchLog(
  log: WatchLog,
  {
    watcher,
    player,
    settings,
    cards
  }: {
    watcher: WatchSource
    player: { playing: boolean; now(): number | undefined }
    settings: { current: { language: Language } }
    cards: EventEmitter
  }
): WatchLogLink {
  const language = (): Language => settings.current.language
  const onScreen = (): string | undefined => (watcher.currentVideo ? videoKey(watcher.currentVideo) : undefined)
  let lastTick: number | undefined
  let videoNotedAt: number | undefined
  let notedKey: string | undefined

  const noteVideo = (now: number): void => {
    const video = watcher.currentVideo
    if (!video) return
    log.noteVideo(video, language(), player.now(), now)
    videoNotedAt = now
    notedKey = videoKey(video)
  }

  // A line is met when it is on screen and translated, whichever happens last.
  const meet = (line: OverlayLine | undefined): void => {
    const key = onScreen()
    if (!key || !line || line.id !== watcher.currentLine?.id) return
    if (notedKey !== key) noteVideo(Date.now())
    log.noteLine(key, language(), line)
  }
  watcher.on('current', () => meet(watcher.currentLine))
  watcher.on('line', (line: OverlayLine) => meet(line))

  cards.on('saved', (card: Card) => {
    const moment = card.source.kind === 'video' ? card.source.moment : undefined
    log.noteWord({
      kind: 'saved',
      videoKey: moment?.video.id ? videoKey({ site: moment.video.site, id: moment.video.id }) : undefined,
      language: card.language,
      text: card.expression,
      line: moment?.line.original,
      start: moment?.line.start
    })
  })

  return {
    tick(now = Date.now()) {
      const key = onScreen()
      const since = lastTick === undefined ? 0 : Math.min(now - lastTick, MAX_TICK_MS)
      lastTick = now
      if (!key) return
      if (key !== notedKey || videoNotedAt === undefined || now - videoNotedAt >= VIDEO_EVERY_MS) noteVideo(now)
      if (player.playing) log.addWatchTime(since, key, now)
    },
    explained(moment) {
      const video = moment.video.id ? videoKey({ site: moment.video.site, id: moment.video.id }) : undefined
      log.noteWord({ kind: 'explained', videoKey: video, language: moment.language, text: moment.line.original, line: moment.line.original, start: moment.line.start })
    },
    hovered() {
      // Task 6.
    }
  }
}
```


- [ ] **Step 4: Widen `currentVideo`**

In `src/main/watcher.ts`, replace the `currentVideo` getter:

```ts
  /** The video open in the browser, if any: its site, the site's id for it, URL and title. */
  get currentVideo(): { site: Source['site']; id: string; url: string; title?: string } | undefined {
    return this.video && { site: this.video.source.site, id: this.video.id, url: this.video.url, title: this.video.title }
  }
```

- [ ] **Step 5: Emit `saved` from `Cards`**

In `src/main/cards/index.ts`, `saveDraft` becomes:

```ts
  /** Saves a card; the same card already saved is found instead, unless `again` saves it anyway.
   * Emits "saved" with a newly saved card (the watch log records it). */
  saveDraft(draft: CardDraft, { again }: { again?: boolean } = {}): SaveResult {
    const result = this.store.save(draft, this.scheduler, { again })
    this.changed()
    if ('saved' in result) this.emit('saved', result.saved)
    return result
  }
```

- [ ] **Step 6: Wire it in `src/main/index.ts`**

Add imports:

```ts
import { WatchLog } from './watchlog'
import { connectWatchLog } from './watchlog/connect'
```

After `const tutor = ...` / `const explain = ...` and before `explainLine` is defined (the watcher, player, settings and cards exist by then), add:

```ts
  // The watch log: videos, lines met, words and study days, for the daily session, checkpoints and
  // the streak (src/main/watchlog).
  const watchLog = new WatchLog()
  const logLink = connectWatchLog(watchLog, { watcher, player, settings, cards })
  app.on('before-quit', () => watchLog.flush())
```

In `explainLine`, after `explain.open(moment)`, add `logLink.explained(moment)`. (Leave the cards' `practise` path alone: practising a saved card is not a new explanation of something met.)

In the `setInterval(() => { watcher.tick(); ... }, TICK_MS)` loop, add `logLink.tick()` after `player.sample()`.

(`app` is already imported from `electron` in index.ts.)

- [ ] **Step 7: Run the tests and the app check**

Run: `npx prettier --write src/main/watchlog/connect.ts src/main/watcher.ts src/main/cards/index.ts src/main/index.ts && npx jiti scripts/test-watch-log.mjs && npm run typecheck && npx eslint src scripts --quiet && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/watchlog/connect.ts app/src/main/watcher.ts app/src/main/cards/index.ts app/src/main/index.ts app/scripts/test-watch-log.mjs
git commit -m "Feed the watch log from watching, saves and Explain"
```

---

### Task 6: Word hovers from the strip

**Files:**
- Modify: `src/main/watchlog/connect.ts` (`hovered`)
- Modify: `src/main/ipc/overlay.ts` (channel, comment list, `Actions` type)
- Modify: `src/preload/overlay.ts` (`hoveredWord`)
- Modify: `src/main/index.ts` (pass `hoveredWord` to `connectOverlay`)
- Modify: `src/renderer/src/overlay/LineView.tsx` (300 ms dwell)
- Test: `scripts/test-watch-log.mjs`

**Interfaces:**
- Consumes: `WatchLogLink`, `WatchSource.moment` (Task 5)
- Produces:
  - IPC `duet:hovered-word` (lineId: number, text: string), one-way
  - `window.duet.hoveredWord(lineId: number, text: string): void`
  - `HOVER_DWELL_MS = 300` in LineView.tsx

- [ ] **Step 1: Write the failing tests**

In `scripts/test-watch-log.mjs`, before `console.log(...)`, add:

```js
  // --- Word hovers -------------------------------------------------------------------------------
  // 친구 and 랑 share pair 1, so the strip's popup (and the hover) names them together: "친구랑".
  const tokens = [
    { text: '저는', job: 'p', pair: 0, space: true },
    { text: '친구', job: 'n', pair: 1, space: false },
    { text: '랑', job: 'g', pair: 1, space: true },
    { text: '봤어요', job: 'v', pair: 2, space: false }
  ]
  const hoveredLine = { ...line('저는 친구랑 봤어요', 80, { id: 7 }), processed: { translation: 'I saw it with a friend', source: tokens, english: [] } }
  watcher.moment = (lineId) =>
    lineId === 7 ? { language: 'ko', line: hoveredLine, earlier: [], video: { site: 'youtube', id: 'fed', position: 80 }, takenAt: 0 } : undefined
  link.hovered(7, '친구랑')
  link.hovered(7, '친구') // part of a pair, not what the strip names
  link.hovered(7, 'rm -rf /') // not a word of that line
  link.hovered(99, '친구랑') // no such line
  link.hovered('7', '친구랑') // not a line id
  assert.equal(count("SELECT COUNT(*) n FROM word_events WHERE kind = 'hovered' AND video_id = 'youtube:fed'"), 1, 'only a word of that line is logged')
  assert.equal(database().prepare("SELECT line, start FROM word_events WHERE kind = 'hovered' AND video_id = 'youtube:fed'").get().start, 80)
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jiti scripts/test-watch-log.mjs`
Expected: FAIL, "only a word of that line is logged" (0 !== 1).

- [ ] **Step 3: Fill in `hovered`**

In `src/main/watchlog/connect.ts`, add `import { joinTokens } from '../../shared/levels'` and replace the `hovered()` stub:

```ts
    hovered(lineId, text) {
      // The strip only names a line and a word; both must check out against the line itself.
      if (typeof lineId !== 'number' || typeof text !== 'string') return
      const moment = watcher.moment(lineId)
      const source = moment?.line.processed?.source ?? []
      // What the strip's popup names for each pair: its tokens joined (overlay/words.ts pairOf).
      const pairs = new Set(source.map((token) => token.pair).filter((pair): pair is number => pair !== null))
      const words = [...pairs].map((pair) => joinTokens(source.filter((token) => token.pair === pair)))
      if (!moment || !moment.video.id || !words.includes(text)) return
      log.noteWord({
        kind: 'hovered',
        videoKey: videoKey({ site: moment.video.site, id: moment.video.id }),
        language: moment.language,
        text,
        line: moment.line.original,
        start: moment.line.start
      })
    }
```

- [ ] **Step 4: The channel and the bridge**

In `src/main/ipc/overlay.ts`:
- Add to the channel list comment: `//   duet:hovered-word  the pointer rested on a word of a line (the watch log notes it)`
- Add to the actions type: `hoveredWord: (lineId: number, text: string) => void`
- Add next to `duet:replay`: `ipcMain.on('duet:hovered-word', (_, lineId: unknown, text: unknown) => actions.hoveredWord(lineId as number, text as string))`

In `src/preload/overlay.ts`, add next to `replay`:

```ts
  /** The pointer rested on a word of a line (for the watch log). */
  hoveredWord: (lineId: number, text: string) => ipcRenderer.send('duet:hovered-word', lineId, text),
```

In `src/main/index.ts`, in the `connectOverlay(overlay, { ... })` actions, add:

```ts
    hoveredWord: (lineId, text) => logLink.hovered(lineId, text),
```

(`logLink` exists by then: Task 5 creates it right after `const explain = ...`, above `explainLine` and above `connectOverlay`.)

- [ ] **Step 5: The 300 ms dwell on the strip**

In `src/renderer/src/overlay/LineView.tsx`, add `useEffect` to the React import and, near the top of the file:

```ts
// A word counts as looked at (for the watch log) after the pointer rests on it this long; passing
// over words on the way somewhere doesn't count.
const HOVER_DWELL_MS = 300
```

In `LineView`, hooks must run on every render, so add this right after `const ready = ...` and before the `if (!ready)` early return:

```ts
  const hoveredText = hover && ready ? pairOf(ready, hover.pair)?.source : undefined
  useEffect(() => {
    if (!hoveredText) return
    const timer = window.setTimeout(() => window.duet.hoveredWord(line.id, hoveredText), HOVER_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [line.id, hoveredText])
```

`pairOf` (overlay/words.ts) joins the pair's tokens with `joinTokens` from src/shared/levels.ts, the same join main checks against in Step 3, so `hoveredText` is exactly the word the popup shows in bold.

- [ ] **Step 6: Run everything**

Run: `npx prettier --write src/main/watchlog/connect.ts src/main/ipc/overlay.ts src/preload/overlay.ts src/main/index.ts src/renderer/src/overlay/LineView.tsx && npx jiti scripts/test-watch-log.mjs && npm run typecheck && npx eslint src scripts --quiet && npm test && npm run build`
Expected: all pass, the build succeeds.

- [ ] **Step 7: Check it in the app**

Start Duet on the stand-in reader with CDP (`DUET_READER=dev/stand-in-reader.mjs DUET_SAY=<file> npx electron-vite dev --remoteDebuggingPort 9222`), feed two caption lines through the say-file, let the stand-in play for 30 s, rest the pointer on a word for half a second, and press Explain. Then read the database (`~/Library/Application Support/<app name>/duet.db`, via `node -e` with `node:sqlite`, read-only):
- `videos` has the stand-in video with a title and `watched_ms` ≥ 15000;
- `lines` has the two lines;
- `word_events` has one `hovered` and one `explained` row;
- `days` has today's study day.

Remove those test rows afterwards (the learner's real database): delete the stand-in video's rows from `lines`, `word_events` and `videos`, and subtract its `watched_ms` from today's `days` row. Restart Duet on the real reader.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/watchlog/connect.ts app/src/main/ipc/overlay.ts app/src/preload/overlay.ts app/src/main/index.ts app/src/renderer/src/overlay/LineView.tsx app/scripts/test-watch-log.mjs
git commit -m "Log a word when the pointer rests on it on the strip"
```
