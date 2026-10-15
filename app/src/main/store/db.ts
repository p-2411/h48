// Duet's local database: one SQLite file in the app's data folder, using Node's built-in SQLite (no
// native add-on to rebuild). Everything the learner keeps lives here: settings, cards and their
// review history, and the watch log (src/main/watchlog). Nothing is synced anywhere.
//
// The schema only moves forward: each migration runs once, in order, and PRAGMA user_version
// records how far a database has got. Never edit a migration that has shipped; add a new one.
import { app } from 'electron'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'

const MIGRATIONS: string[] = [
  // 1: settings, cards, reviews.
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL              -- JSON
  );

  CREATE TABLE cards (
    id            TEXT PRIMARY KEY,
    revision      INTEGER NOT NULL DEFAULT 1,  -- goes up on every edit; reviews name the revision they saw
    type          TEXT NOT NULL CHECK (type IN ('understand', 'use')),
    language      TEXT NOT NULL,
    expression    TEXT NOT NULL,     -- what is learnt, in the language learnt
    reading       TEXT,
    meaning       TEXT NOT NULL,
    target        TEXT NOT NULL,     -- the one thing the card tests
    situation     TEXT,
    alternative   TEXT,
    note          TEXT,
    source        TEXT NOT NULL,     -- JSON: the moment it came from (line, context, video)
    explanation   TEXT,              -- JSON: the explanation it came from, with the model that wrote it
    dedupe_key    TEXT NOT NULL,     -- same source line + target + type = the same card
    paused        INTEGER NOT NULL DEFAULT 0,
    deleted_at    INTEGER,           -- set on delete; removed for good once the undo time has passed
    fsrs          TEXT NOT NULL,     -- JSON: the scheduler's card state
    fsrs_version  TEXT NOT NULL,
    state         INTEGER NOT NULL,  -- copied from fsrs for queries: 0 new, 1 learning, 2 review, 3 relearning
    due           INTEGER NOT NULL,  -- copied from fsrs, ms since 1970
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX cards_queue ON cards (deleted_at, paused, due);
  CREATE INDEX cards_dedupe ON cards (dedupe_key);

  -- Append-only: one row per rated review. Undo marks a row undone, it never deletes or adds one.
  CREATE TABLE reviews (
    id             TEXT PRIMARY KEY,  -- the submission's own id, so a double submit applies once
    card_id        TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    card_revision  INTEGER NOT NULL,
    rating         INTEGER NOT NULL,  -- 1 again, 2 hard, 3 good, 4 easy
    reviewed_at    INTEGER NOT NULL,
    study_day      TEXT NOT NULL,     -- the local study day (rolls over at 04:00) for daily counts
    was_new        INTEGER NOT NULL,  -- the card's first rating: counts against the new-card allowance
    before         TEXT NOT NULL,     -- JSON: scheduler state before
    after          TEXT NOT NULL,     -- JSON: scheduler state after
    log            TEXT NOT NULL,     -- JSON: the scheduler's review log
    scheduler      TEXT NOT NULL,     -- JSON: scheduler version and settings used
    undone_at      INTEGER
  );
  CREATE INDEX reviews_card ON reviews (card_id, reviewed_at);
  CREATE INDEX reviews_day ON reviews (study_day);
  `,
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
    text      TEXT NOT NULL,       -- the word or expression (a starred line: the whole line); the line for 'explained'
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
  `,
  // 3: the lines met lately in a video, for checkpoints (asked every few seconds while watching).
  `
  CREATE INDEX lines_recent ON lines (video_id, language, met_at);
  `,
  // 4: the knowledge ladder (src/main/knowledge): each word met, by its key (its dictionary form),
  // and what the learner did with it; cards name the word they are for.
  `
  CREATE TABLE words (
    language   TEXT NOT NULL,
    key        TEXT NOT NULL,     -- shared/knowledge.ts wordKey: "es:ir"
    text       TEXT NOT NULL,     -- as it was last on screen ("fue")
    job        TEXT NOT NULL,     -- its job there (names and grammar words start ignored)
    seen       INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    ignored    INTEGER,           -- the learner's choice (1 or 0); none: by its job
    PRIMARY KEY (language, key)
  );
  CREATE TABLE word_evidence (
    id       INTEGER PRIMARY KEY,
    language TEXT NOT NULL,
    key      TEXT NOT NULL,
    kind     TEXT NOT NULL CHECK (kind IN ('recall', 'say', 'use')),
    good     INTEGER NOT NULL,
    context  TEXT,                -- for a use: the learner's sentence
    at       INTEGER NOT NULL
  );
  CREATE INDEX word_evidence_key ON word_evidence (language, key);
  ALTER TABLE cards ADD COLUMN word_key TEXT;
  CREATE INDEX cards_word ON cards (language, word_key);
  `,
  // 5: the Words place lists a language's words, the last seen first.
  `
  CREATE INDEX words_recent ON words (language, last_seen);
  `,
  // 6: progress (src/main/progress): each video's words, from the lines met, never pruned (so a video
  // keeps its % and reading level after its lines go), and its % on each study day it was watched.
  `
  CREATE TABLE video_words (
    video_id TEXT NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    key      TEXT NOT NULL,     -- shared/knowledge.ts wordKey
    text     TEXT NOT NULL,     -- as it was last on screen
    job      TEXT NOT NULL,
    count    INTEGER NOT NULL,  -- times met in the video's lines
    PRIMARY KEY (video_id, language, key)
  );
  CREATE TABLE video_scores (
    video_id TEXT NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    day      TEXT NOT NULL,     -- the study day (rolls over at 04:00); the first is the video's "then"
    score    REAL NOT NULL,     -- 0 to 1
    at       INTEGER NOT NULL,
    PRIMARY KEY (video_id, language, day)
  );
  `
]

let db: DatabaseSync | undefined

/** The database, opened (and brought up to date) on first use. */
export function database(): DatabaseSync {
  if (db) return db
  // Wait up to 2 s if another connection is writing, instead of failing at once.
  db = new DatabaseSync(join(app.getPath('userData'), 'duet.db'), { timeout: 2000 })
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number
  }
  for (let index = version; index < MIGRATIONS.length; index++) {
    transaction(() => {
      db!.exec(MIGRATIONS[index])
      db!.exec(`PRAGMA user_version = ${index + 1}`)
    })
  }
  return db
}

/** Runs `work` so that either all of its writes happen or none do. */
export function transaction<T>(work: () => T): T {
  const handle = db ?? database()
  handle.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    handle.exec('COMMIT')
    return result
  } catch (error) {
    handle.exec('ROLLBACK')
    throw error
  }
}

/** A saved setting, or undefined when it is missing or its JSON is damaged. */
export function readSetting<T>(key: string): T | undefined {
  const row = database().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as T
  } catch {
    return undefined
  }
}

/** Saves a setting as JSON, replacing any earlier value. */
export function writeSetting(key: string, value: unknown): void {
  database()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
    )
    .run(key, JSON.stringify(value))
}
