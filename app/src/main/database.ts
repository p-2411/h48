import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createEmptyCard, fsrs, Rating, type Card, type Grade, type ReviewLog } from 'ts-fsrs'
import type {
  AppSettings,
  DuetCard,
  FsrsCardState,
  ReviewInput,
  ReviewPreview,
  ReviewQueue,
  ReviewRating,
  SaveCardInput,
  UpdateCardInput
} from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  readingAids: 'kana',
  textScale: 'default',
  newCardAllowance: 10,
  desiredRetention: 0.9,
  explanationLanguage: 'balanced'
}

interface CardRow {
  id: string
  expression: string
  reading: string | null
  meaning: string
  target: string
  context: string
  alternative: string | null
  consequence: string | null
  card_type: 'understand' | 'use'
  source_type: 'video' | 'tutor'
  video_url: string | null
  video_title: string | null
  source_timestamp: number | null
  note: string | null
  provenance: string
  created_at: string
  updated_at: string
  paused: number
  revision: number
  scheduler_state: string
  latest_review_id?: string | null
  latest_rating?: ReviewRating | null
  latest_reviewed_at?: string | null
  latest_undone?: number | null
}

interface ReviewRow {
  id: string
  card_id: string
  rating: ReviewRating
  reviewed_at: string
  before_state: string
  after_state: string
  engine_log: string
  card_revision: number
  undone: number
}

function serialiseCardState(card: Card): FsrsCardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : {})
  }
}

function reviveCardState(card: FsrsCardState): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined
  } as Card
}

function intervalLabel(due: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export class DuetDatabase {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        expression TEXT NOT NULL,
        reading TEXT,
        meaning TEXT NOT NULL,
        target TEXT NOT NULL,
        context TEXT NOT NULL,
        alternative TEXT,
        consequence TEXT,
        card_type TEXT NOT NULL CHECK(card_type IN ('understand','use')),
        source_type TEXT NOT NULL CHECK(source_type IN ('video','tutor')),
        video_url TEXT,
        video_title TEXT,
        source_timestamp REAL,
        note TEXT,
        provenance TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        paused INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        scheduler_state TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cards_due_idx ON cards(paused, updated_at);
      CREATE TABLE IF NOT EXISTS review_events (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        rating TEXT NOT NULL CHECK(rating IN ('again','hard','good','easy')),
        reviewed_at TEXT NOT NULL,
        before_state TEXT NOT NULL,
        after_state TEXT NOT NULL,
        engine_log TEXT NOT NULL,
        card_revision INTEGER NOT NULL,
        undone INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS review_card_time_idx ON review_events(card_id, reviewed_at DESC);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS voice_attempts (
        id TEXT PRIMARY KEY,
        target_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        assessed_properties TEXT NOT NULL,
        feedback TEXT NOT NULL,
        limitation TEXT
      );
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('schema_version', '1');
      INSERT OR IGNORE INTO settings(key, value) VALUES ('app', '${JSON.stringify(DEFAULT_SETTINGS)}');
    `)
  }

  private rowToCard(row: CardRow): DuetCard {
    return {
      id: row.id,
      expression: row.expression,
      reading: row.reading ?? undefined,
      meaning: row.meaning,
      target: row.target,
      context: row.context,
      alternative: row.alternative ?? undefined,
      consequence: row.consequence ?? undefined,
      cardType: row.card_type,
      sourceType: row.source_type,
      videoUrl: row.video_url ?? undefined,
      videoTitle: row.video_title ?? undefined,
      sourceTimestamp: row.source_timestamp ?? undefined,
      note: row.note ?? undefined,
      provenance: row.provenance,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paused: Boolean(row.paused),
      revision: row.revision,
      scheduler: JSON.parse(row.scheduler_state) as FsrsCardState,
      ...(row.latest_review_id
        ? {
            latestReview: {
              id: row.latest_review_id,
              rating: row.latest_rating as ReviewRating,
              reviewedAt: row.latest_reviewed_at as string,
              undone: Boolean(row.latest_undone)
            }
          }
        : {})
    }
  }

  listCards(): DuetCard[] {
    const rows = this.db
      .prepare(
        `
        SELECT c.*,
          r.id AS latest_review_id,
          r.rating AS latest_rating,
          r.reviewed_at AS latest_reviewed_at,
          r.undone AS latest_undone
        FROM cards c
        LEFT JOIN review_events r ON r.id = (
          SELECT id FROM review_events
          WHERE card_id = c.id
          ORDER BY reviewed_at DESC LIMIT 1
        )
        ORDER BY c.created_at DESC
      `
      )
      .all() as unknown as CardRow[]
    return rows.map((row) => this.rowToCard(row))
  }

  getCard(id: string): DuetCard {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as unknown as
      CardRow | undefined
    if (!row) throw new Error('CARD_NOT_FOUND')
    return this.rowToCard(row)
  }

  createCard(input: SaveCardInput): DuetCard {
    if (!input.expression.trim() || !input.meaning.trim() || !input.target.trim()) {
      throw new Error('CARD_REQUIRED_FIELDS')
    }
    const duplicate = this.db
      .prepare(
        `
        SELECT id FROM cards
        WHERE expression = ? AND card_type = ?
          AND COALESCE(video_url, '') = COALESCE(?, '')
          AND COALESCE(source_timestamp, -1) = COALESCE(?, -1)
        LIMIT 1
      `
      )
      .get(
        input.expression.trim(),
        input.cardType,
        input.videoUrl ?? null,
        input.sourceTimestamp ?? null
      ) as { id: string } | undefined
    if (duplicate) throw new Error(`DUPLICATE_CARD:${duplicate.id}`)

    const id = randomUUID()
    const now = new Date().toISOString()
    const scheduler = serialiseCardState(createEmptyCard(new Date()))
    this.db
      .prepare(
        `
        INSERT INTO cards (
          id, expression, reading, meaning, target, context, alternative, consequence,
          card_type, source_type, video_url, video_title, source_timestamp, note,
          provenance, created_at, updated_at, scheduler_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        input.expression.trim(),
        input.reading?.trim() || null,
        input.meaning.trim(),
        input.target.trim(),
        input.context.trim(),
        input.alternative?.trim() || null,
        input.consequence?.trim() || null,
        input.cardType,
        input.sourceType,
        input.videoUrl || null,
        input.videoTitle || null,
        input.sourceTimestamp ?? null,
        input.note?.trim() || null,
        input.provenance,
        now,
        now,
        JSON.stringify(scheduler)
      )
    return this.getCard(id)
  }

  updateCard(input: UpdateCardInput): DuetCard {
    const current = this.getCard(input.id)
    if (current.revision !== input.expectedRevision) throw new Error('STALE_CARD_REVISION')
    const next = { ...current, ...input }
    const learningTargetChanged =
      (input.expression !== undefined && input.expression !== current.expression) ||
      (input.target !== undefined && input.target !== current.target) ||
      (input.cardType !== undefined && input.cardType !== current.cardType)
    if (learningTargetChanged && current.scheduler.reps > 0)
      throw new Error('TARGET_CHANGE_REQUIRES_NEW_CARD')

    this.db
      .prepare(
        `
        UPDATE cards SET expression=?, reading=?, meaning=?, target=?, context=?, alternative=?, consequence=?,
          card_type=?, source_type=?, video_url=?, video_title=?, source_timestamp=?, note=?, provenance=?,
          paused=?, updated_at=?, revision=revision+1
        WHERE id=? AND revision=?
      `
      )
      .run(
        next.expression,
        next.reading || null,
        next.meaning,
        next.target,
        next.context,
        next.alternative || null,
        next.consequence || null,
        next.cardType,
        next.sourceType,
        next.videoUrl || null,
        next.videoTitle || null,
        next.sourceTimestamp ?? null,
        next.note || null,
        next.provenance,
        next.paused ? 1 : 0,
        new Date().toISOString(),
        input.id,
        input.expectedRevision
      )
    return this.getCard(input.id)
  }

  deleteCard(id: string): void {
    this.db.prepare('DELETE FROM cards WHERE id = ?').run(id)
  }

  getReviewQueue(): ReviewQueue {
    const now = new Date()
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    const cards = this.listCards().filter((card) => !card.paused)
    const dueCards = cards.filter((card) => new Date(card.scheduler.due) <= now)
    const settings = this.getSettings()
    const newCards = dueCards.filter((card) => card.scheduler.state === 0)
    const established = dueCards.filter((card) => card.scheduler.state !== 0)
    const queue = [...established, ...newCards.slice(0, settings.newCardAllowance)]
    return {
      cards: queue,
      counts: {
        dueNow: established.length,
        laterToday: cards.filter((card) => {
          const due = new Date(card.scheduler.due)
          return due > now && due <= endOfDay
        }).length,
        newCards: newCards.length
      }
    }
  }

  previewReview(cardId: string): ReviewPreview[] {
    const card = this.getCard(cardId)
    const settings = this.getSettings()
    const scheduler = fsrs({ request_retention: settings.desiredRetention })
    const now = new Date()
    const outcomes = scheduler.repeat(reviveCardState(card.scheduler), now)
    const ratings: Array<[ReviewRating, Rating]> = [
      ['again', Rating.Again],
      ['hard', Rating.Hard],
      ['good', Rating.Good],
      ['easy', Rating.Easy]
    ]
    return ratings.map(([rating, value]) => ({
      rating,
      due: outcomes[value].card.due.toISOString(),
      intervalLabel: intervalLabel(outcomes[value].card.due, now)
    }))
  }

  reviewCard(input: ReviewInput): DuetCard {
    const existing = this.db.prepare('SELECT id FROM review_events WHERE id = ?').get(input.eventId)
    if (existing) return this.getCard(input.cardId)

    const current = this.getCard(input.cardId)
    if (current.revision !== input.expectedRevision) throw new Error('STALE_CARD_REVISION')
    const settings = this.getSettings()
    const scheduler = fsrs({ request_retention: settings.desiredRetention })
    const ratings: Record<ReviewRating, Grade> = {
      again: Rating.Again,
      hard: Rating.Hard,
      good: Rating.Good,
      easy: Rating.Easy
    }
    const reviewedAt = new Date()
    const beforeState = current.scheduler
    const result = scheduler.next(reviveCardState(beforeState), reviewedAt, ratings[input.rating])
    const afterState = serialiseCardState(result.card)

    this.db.exec('BEGIN IMMEDIATE')
    try {
      const update = this.db
        .prepare(
          `
          UPDATE cards SET scheduler_state=?, updated_at=?, revision=revision+1
          WHERE id=? AND revision=?
        `
        )
        .run(
          JSON.stringify(afterState),
          reviewedAt.toISOString(),
          input.cardId,
          input.expectedRevision
        )
      if (update.changes !== 1) throw new Error('STALE_CARD_REVISION')
      this.db
        .prepare(
          `
          INSERT INTO review_events (
            id, card_id, rating, reviewed_at, before_state, after_state, engine_log, card_revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          input.eventId,
          input.cardId,
          input.rating,
          reviewedAt.toISOString(),
          JSON.stringify(beforeState),
          JSON.stringify(afterState),
          JSON.stringify(result.log satisfies ReviewLog),
          input.expectedRevision
        )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getCard(input.cardId)
  }

  undoLatestReview(cardId: string): DuetCard {
    const card = this.getCard(cardId)
    const event = this.db
      .prepare(
        `
        SELECT * FROM review_events
        WHERE card_id=? AND undone=0
        ORDER BY reviewed_at DESC LIMIT 1
      `
      )
      .get(cardId) as unknown as ReviewRow | undefined
    if (!event) throw new Error('NO_REVIEW_TO_UNDO')
    if (card.revision !== event.card_revision + 1) throw new Error('STALE_UNDO')

    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare('UPDATE cards SET scheduler_state=?, updated_at=?, revision=revision+1 WHERE id=?')
        .run(event.before_state, new Date().toISOString(), cardId)
      this.db.prepare('UPDATE review_events SET undone=1 WHERE id=?').run(event.id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getCard(cardId)
  }

  getSettings(): AppSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='app'").get() as
      { value: string } | undefined
    return { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<AppSettings>) : {}) }
  }

  saveSettings(settings: AppSettings): AppSettings {
    const safe: AppSettings = {
      ...settings,
      newCardAllowance: Math.max(0, Math.min(100, Math.round(settings.newCardAllowance))),
      desiredRetention: Math.max(0.7, Math.min(0.99, settings.desiredRetention))
    }
    this.db
      .prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('app', ?)")
      .run(JSON.stringify(safe))
    return safe
  }

  exportBackup(): string {
    const cards = this.db.prepare('SELECT * FROM cards ORDER BY created_at').all()
    const reviews = this.db.prepare('SELECT * FROM review_events ORDER BY reviewed_at').all()
    return JSON.stringify(
      {
        format: 'duet-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        scheduler: { implementation: 'ts-fsrs', packageVersion: '5.4.2' },
        settings: this.getSettings(),
        cards,
        reviews
      },
      null,
      2
    )
  }

  importBackup(payload: string): void {
    const parsed = JSON.parse(payload) as {
      format?: string
      version?: number
      settings?: AppSettings
      cards?: CardRow[]
      reviews?: ReviewRow[]
    }
    if (parsed.format !== 'duet-backup' || parsed.version !== 1 || !Array.isArray(parsed.cards)) {
      throw new Error('INVALID_BACKUP')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of parsed.cards) {
        if (!row.id || !row.expression || !row.scheduler_state)
          throw new Error('INVALID_BACKUP_CARD')
        this.db
          .prepare(
            `
            INSERT OR IGNORE INTO cards (
              id, expression, reading, meaning, target, context, alternative, consequence,
              card_type, source_type, video_url, video_title, source_timestamp, note, provenance,
              created_at, updated_at, paused, revision, scheduler_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            row.id,
            row.expression,
            row.reading,
            row.meaning,
            row.target,
            row.context,
            row.alternative,
            row.consequence,
            row.card_type,
            row.source_type,
            row.video_url,
            row.video_title,
            row.source_timestamp,
            row.note,
            row.provenance,
            row.created_at,
            row.updated_at,
            row.paused,
            row.revision,
            row.scheduler_state
          )
      }
      for (const row of parsed.reviews ?? []) {
        this.db
          .prepare(
            `
            INSERT OR IGNORE INTO review_events (
              id, card_id, rating, reviewed_at, before_state, after_state, engine_log, card_revision, undone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            row.id,
            row.card_id,
            row.rating,
            row.reviewed_at,
            row.before_state,
            row.after_state,
            row.engine_log,
            row.card_revision,
            row.undone
          )
      }
      if (parsed.settings) this.saveSettings(parsed.settings)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  clearAllData(): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('DELETE FROM review_events; DELETE FROM voice_attempts; DELETE FROM cards;')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}
