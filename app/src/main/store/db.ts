// Duet's local database: one SQLite file in the app's data folder, using Node's built-in SQLite (no
// native add-on to rebuild). Everything the learner keeps lives here: settings, cards and their
// review history. Nothing is synced anywhere.
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
  `
]

let db: DatabaseSync | undefined

/** The database, opened (and brought up to date) on first use. */
export function database(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(join(app.getPath('userData'), 'duet.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
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
