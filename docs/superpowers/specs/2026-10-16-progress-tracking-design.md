# Progress tracking: design

Date: 2026-10-16
Status: agreed in brainstorming (2026-10-16); written for review

## Purpose

The landing page promises that learners can see themselves get better. This spec turns the knowledge ladder and the watch log into those numbers:

- vocabulary size: words met, and words you know;
- each word's place on the ladder (seen → known → can say → can use);
- the % of each video you understand;
- that % going up over time;
- reading levels: videos graded by how hard their words are.

## What we agreed

- **A weighted score, not a yes/no count.** Each rung gives part of the credit. 100% means every word in the video is at "can use".
- **Connectors count less.** Glue words and names do not count. Pronouns and question words count half.
- **Only the part watched.** Duet splits a line into words only when the learner meets it on screen, so a video's % covers the lines met.
- **Then and now.** Each video keeps its % from when it was watched, and shows its % now from today's rungs. Both are over the same words: "then" credits each word as it was known when first met in the video. The % can go up without a rewatch, or down when words are forgotten.
- **Videos are graded, learners are not levelled.** A reading level is a property of a video. There is no "mastered" state. Progress is understanding more of harder videos over time.
- **Objective and sequential grading.** A video's reading level comes from word coverage against a word-frequency list. It does not come from a model's opinion. The levels are steps on one scale (1–6), with no genre names.
- **In the existing places.** Watching, the Continue watching tile, and Your words (page and tile). No new page.
- **The strip stays free of numbers**, and so does the end of the daily session.

## 1. The score of a video

The score uses `src/shared/progress.ts`, which is pure code.

**Units.** A unit is one word pair of a line: one word, or a set phrase the line model pairs as one ("de nada"). A unit is named by its key (its dictionary form, `shared/knowledge.ts` `pairKeys`). It counts once each time it appears in a line met.

**Weight by job:**

| Job | Weight |
|---|---|
| things, actions, describing words (`n`, `v`, `a`) | 1 |
| pronouns and question words (`p`) | ½ |
| glue and names (`g`, `x`) | 0 |

A word on the "ignored" rung (by its job or by the learner's choice) also weighs 0. Thus it never holds the score back.

**Credit by rung:**

| Rung | Credit |
|---|---|
| New to you, Seen before | 0 |
| Known | 0.6 |
| You can say it | 0.8 |
| You can use it | 1 |

**The %:** Σ (count × weight × credit) ÷ Σ (count × weight), rounded down to a whole %. A video shows no % until Σ (count × weight) is at least 15 (a few lines).

**Then and now.** "Now" uses each word's rung today. "Then" uses the same words and counts, but credits each word as it was known when it was first met in the video (noted as the line is met). So the two always compare the same words, however many days a video is watched over. A word ignored now is left out of both.

## 2. Reading levels

A video's reading level is the number of the language's most common words that a learner needs to know to understand nearly all of the video.

**The lists.** Each language uses one word-frequency list from the same source: wordfreq 3.1 (Robyn Speer), `large_es`, `large_ja` and `small_ko`. Each list keeps its top 10,000 words in rank order, about 100 KB. The data is CC BY-SA 4.0, so Settings shows a line of attribution. A script in `scripts/` makes the lists from the wordfreq wheel. The lists are committed, so a build does not need Python.

**A unit's rank** is the best (lowest) rank of these forms:

- its dictionary form, as Duet keeps it;
- the form last seen on screen;
- Korean verbs and describing words only: the dictionary form without a final 하다 or 다 (wordfreq's Korean keeps stems: 먹다 → 먹, 공부하다 → 공부). A noun keeps its 다 (바다 is not 바);
- a phrase with spaces: the rank of its rarest word;
- Japanese and Korean, when a form isn't listed as it is: the form split into listed parts, as few as it can be (wordfreq splits these languages into short pieces, so 大人になる is 大人 + に + なる, and 変わらない is 変わら + ない). Its rank is the rarest part's. A one-letter part must be in the top 100 (a particle or an ending), unless it is a kanji. Spanish words are never split.

A unit that matches no form counts as rarer than every listed word. A unit with no letters (a number) is left out of the grade. In the demo video (a one-hour Japanese conversation), 95% of the word weight is listed, and the rest is really rare (浣腸, 痔).

**The grade.** Sort a video's units by rank. Find the rank at which the units above it hold 90% of the video's weight (count × weight, by job only, not by rung). This is the "coverage rank". Glue words are left out of the weight. 90% of the content words is about the 95% of all words that research uses for easy understanding, because glue words come free.

| Reading level | Coverage rank up to |
|---|---|
| 1 | 500 |
| 2 | 1,000 |
| 3 | 2,000 |
| 4 | 4,000 |
| 5 | 8,000 |
| 6 | more than 8,000 |

A video gets a grade only when its weight is at least 40. The grade is worked out again when the video's words change, so it settles as more lines are met. These thresholds are constants. Tune them after real use.

**In words** (shown with the level): "Reading level 2: the 1,000 most common words cover almost all of it." The app always says "Reading level" in full, to keep these apart from the strip's mix levels (Level 1–5).

## 3. Data

Migration 6 (`src/main/store/db.ts`):

```sql
-- Each video's words, from the lines met: never pruned, so a video keeps its % and reading
-- level after its lines go (lines are kept for the last ~30 videos).
CREATE TABLE video_words (
  video_id     TEXT NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  language     TEXT NOT NULL,
  key          TEXT NOT NULL,     -- shared/knowledge.ts wordKey
  text         TEXT NOT NULL,     -- as it was last on screen
  job          TEXT NOT NULL,     -- a word met in two jobs is counted in each
  count        INTEGER NOT NULL,
  first_credit REAL,              -- its rung's credit when first met here: the video's "then"
  PRIMARY KEY (video_id, language, key, job)
);
```

- **Tallies** are written by `WatchLog.noteLine`, in the same transaction as the line.
- **First credits.** Right after a line is met (and its words seen once more on the ladder), its words new to the video get their credit as known then. A word keeps its first credit. A write that fails is reported and dropped, the same as all watch-log writes; a word with no first credit counts today's.
- **Backfill.** A few seconds after launch (not before the windows are up), a one-time pass rebuilds the tallies from the lines already kept, all or nothing, and credits those words as they are known then (the best there is for them). A setting records that it has run, so a failed run is tried again next time and no line counts twice.
- **"Now"** is worked out from today's rungs each time a page asks.

## 4. Code

- `src/shared/progress.ts` (pure): weights, credits, `videoScore`, unit ranks, `readingLevel`, the level texts, and the summary types.
- `src/main/progress/`: the `Progress` class. It reads the tallies, gets rungs from `Knowledge.statesFor`, and loads the frequency lists. It writes the first credits (`noteMet`), runs the backfill (`catchUp`) and gives `summary(language)`. It keeps each video's words and reading level until that video's words change, so a summary reads again only the videos that changed, and works out the rungs.
- `progress:summary` IPC (language → `ProgressSummary`), with a bridge `window.duet.progress.summary`. `progress:changed` tells the home base that videos' words changed, at most every 10 s, so Watching keeps up while a video plays. Pages also ask again on `knowledge:changed`. Duet's home base asks; the strip never does.

```ts
type VideoProgress = { level?: ReadingLevel; now?: number; then?: number }   // % as 0–100
type LevelProgress = { level: ReadingLevel; videos: number; now: number; then: number }
type ProgressSummary = { videos: Record<string, VideoProgress>; levels: LevelProgress[] }
```

A level's `now` and `then` are the averages over its videos that have a %.

Words met and words known come from the existing Words summary (`knowledge:summary` counts). Met = every rung except ignored. Known = known + can say + can use.

## 5. Where it shows

| Place | What it adds |
|---|---|
| Watching page | On each video: "Reading level 3 · 72% understood", and "up from 58%" when now is above then. At the top, "Your reading levels": each level watched, easiest first, with the average % now, the number of videos, and "up from X%". |
| Continue watching tile | "72% understood" under each video. |
| Your words page | "212 met · 49 you know" before the rung counts. |
| Your words tile | The same line. |
| Settings | The attribution for the word lists. |

- A video with no grade shows no level. A video with too few words shows no %.
- If progress cannot load, the videos still show, without the numbers. One language's numbers never show while another is learnt.
- The strip, the side panel and the daily session show none of these.

## 6. Tests

A new test file, `scripts/test-progress.mjs`, is added to `npm test`. It runs on a temporary database with the fake `electron` module, as `test-knowledge.mjs` does. It checks:

- the score: the weights, the credits, ignored words, and the minimum size;
- unit ranks: dictionary form or the form seen, the Korean stems, phrases, Japanese and Korean split into parts, and words with no match;
- the grade: the coverage rank, the bands, unlisted words as the rarest, and numbers left out;
- tallies from `noteLine`, per job, and the backfill (once only, from scratch);
- first credits, then and now over the same words, and a word learnt between them;
- the summary, its per-video cache, the level averages, and the IPC;
- a line met while watching being credited, and a failure there going no further.

## Changes to other docs

- `2026-10-12-duet-user-flow-design.md`: the "Progress" line, the Backlog line about comprehension scores, and the data table.
- The landing page (`waitlist/`, outside this work): the "Shows you've mastered" card says "Mastered", and its levels have genre names. Both disagree with this design. The founder decides the new words.

## Out of scope

- Recommending videos by reading level (backlog).
- A % over a whole video, including the parts not watched.
- A history chart. "Then and now" per video and per level carries the "going up" for now.
