// The card collection in the local database: saving, finding, editing, pausing, deleting, and
// backing up. Scheduling a review is review.ts; this file only stores what that decides.
import { randomUUID } from 'crypto'
import { z } from 'zod'
import type {
  Card,
  CardContent,
  CardDetail,
  CardDraft,
  CardQuery,
  CardReview,
  CardSource,
  SaveResult
} from '../../shared/cards'
import { LANGUAGE_CODES } from '../../shared/languages'
import { database, transaction } from '../store/db'
import { ratingName, revive, Scheduler, SCHEDULER_VERSION, serialize, stateName } from './scheduler'

// A deleted card can be brought back for this long, then it is removed for good.
export const UNDO_DELETE_MS = 30_000

type CardRow = {
  id: string
  revision: number
  type: Card['type']
  language: Card['language']
  expression: string
  reading: string | null
  meaning: string
  target: string
  situation: string | null
  alternative: string | null
  note: string | null
  source: string
  explanation: string | null
  dedupe_key: string
  paused: number
  deleted_at: number | null
  fsrs: string
  fsrs_version: string
  state: number
  due: number
  created_at: number
  updated_at: number
}

type ReviewRow = {
  id: string
  card_id: string
  card_revision: number
  rating: number
  reviewed_at: number
  study_day: string
  was_new: number
  before: string
  after: string
  log: string
  scheduler: string
  undone_at: number | null
}

/** The source line a card came from: cards from the same line are siblings. */
export function sourceKey(source: CardSource, expression = ''): string {
  if (source.kind === 'tutor') return `tutor:${expression.trim().toLocaleLowerCase()}`
  const { video, line } = source.moment
  return `${video.site}:${video.id ?? video.url ?? ''}:${line.original}`
}

// The same source line, target and type is the same card. The same wording from somewhere else is a
// different card on purpose: a different situation is worth keeping.
function dedupeKey(card: CardContent & { source: CardSource }): string {
  const source = sourceKey(card.source, card.expression)
  return [source, card.target.trim().toLocaleLowerCase(), card.type].join('|')
}

function toCard(row: CardRow): Card {
  const fsrs = revive(row.fsrs)
  return {
    id: row.id,
    revision: row.revision,
    type: row.type,
    language: row.language,
    expression: row.expression,
    reading: row.reading ?? undefined,
    meaning: row.meaning,
    target: row.target,
    situation: row.situation ?? undefined,
    alternative: row.alternative ?? undefined,
    note: row.note ?? undefined,
    source: JSON.parse(row.source),
    explanation: row.explanation ? JSON.parse(row.explanation) : undefined,
    paused: !!row.paused,
    state: stateName(fsrs.state),
    due: row.due,
    lastReview: fsrs.last_review?.getTime(),
    reps: fsrs.reps,
    lapses: fsrs.lapses,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toReview(row: ReviewRow): CardReview {
  return {
    id: row.id,
    rating: ratingName(row.rating),
    reviewedAt: row.reviewed_at,
    undone: row.undone_at !== null,
    dueAfter: revive(row.after).due.getTime()
  }
}

function contentColumns(content: CardContent): (string | null)[] {
  const optional = (text: string | undefined): string | null => (text?.trim() ? text.trim() : null)
  return [
    content.type,
    content.expression.trim(),
    optional(content.reading),
    content.meaning.trim(),
    content.target.trim(),
    optional(content.situation),
    optional(content.alternative),
    optional(content.note)
  ]
}

export class CardStore {
  /** Saves a draft as a new card, unless the same card exists; `again` saves it anyway. */
  save(draft: CardDraft, scheduler: Scheduler, { again = false, now = Date.now() } = {}): SaveResult {
    const key = dedupeKey(draft)
    if (!again) {
      const existing = database()
        .prepare('SELECT * FROM cards WHERE dedupe_key = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1')
        .get(key) as CardRow | undefined
      if (existing) return { duplicate: toCard(existing) }
    }
    const id = randomUUID()
    const fsrs = scheduler.newCard(now)
    database()
      .prepare(
        `INSERT INTO cards (id, type, expression, reading, meaning, target, situation, alternative, note,
           language, source, explanation, dedupe_key, fsrs, fsrs_version, state, due, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        ...contentColumns(draft),
        draft.language,
        JSON.stringify(draft.source),
        draft.explanation ? JSON.stringify(draft.explanation) : null,
        key,
        serialize(fsrs),
        SCHEDULER_VERSION,
        fsrs.state,
        fsrs.due.getTime(),
        now,
        now
      )
    return { saved: this.get(id)! }
  }

  get(id: string): CardDetail | undefined {
    const row = database().prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(id) as CardRow | undefined
    if (!row) return undefined
    const reviews = database()
      .prepare('SELECT * FROM reviews WHERE card_id = ? ORDER BY reviewed_at')
      .all(id) as ReviewRow[]
    return { ...toCard(row), reviews: reviews.map(toReview) }
  }

  /** Newest first. Search looks in the expression, its meaning, the target and notes. */
  list(query: CardQuery = {}, now = Date.now()): Card[] {
    const where = ['deleted_at IS NULL']
    const values: (string | number)[] = []
    if (query.search?.trim()) {
      // Searched as plain text: %, _ and \ in the search mean themselves.
      where.push("(expression LIKE ? ESCAPE '\\' OR meaning LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')")
      values.push(...Array(4).fill(`%${query.search.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`))
    }
    if (query.type) {
      where.push('type = ?')
      values.push(query.type)
    }
    if (query.show === 'new') where.push('state = 0 AND paused = 0')
    if (query.show === 'paused') where.push('paused = 1')
    if (query.show === 'due') {
      where.push('state != 0 AND paused = 0 AND due <= ?')
      values.push(now)
    }
    // The limit is applied in the query, so a search with many matches reads only what is shown.
    const limit = Number.isInteger(query.limit) && query.limit! > 0 ? ' LIMIT ?' : ''
    if (limit) values.push(query.limit!)
    const rows = database()
      .prepare(`SELECT * FROM cards WHERE ${where.join(' AND ')} ORDER BY created_at DESC${limit}`)
      .all(...values) as CardRow[]
    return rows.map(toCard)
  }

  /** Whether any card is saved (deleted cards do not count). */
  hasCards(): boolean {
    return !!database().prepare('SELECT 1 FROM cards WHERE deleted_at IS NULL LIMIT 1').get()
  }

  /** Makes a card due now (it was due later): the learner missed its word. Early reviews are fine for
   * the scheduler. The revision goes up, as the outcomes shown before no longer apply. */
  bringForward(id: string, now = Date.now()): Card {
    const row = database().prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(id) as CardRow | undefined
    if (!row) throw new Error('That card no longer exists.')
    if (row.due > now) {
      const fsrs = revive(row.fsrs)
      fsrs.due = new Date(now)
      database()
        .prepare('UPDATE cards SET fsrs = ?, due = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
        .run(serialize(fsrs), now, now, id)
    }
    return this.get(id)!
  }

  /** A content edit. Scheduling is kept: use it for corrections that test the same thing. */
  update(id: string, content: CardContent, now = Date.now()): Card {
    const row = database().prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(id) as CardRow | undefined
    if (!row) throw new Error('That card no longer exists.')
    database()
      .prepare(
        `UPDATE cards SET type = ?, expression = ?, reading = ?, meaning = ?, target = ?, situation = ?, alternative = ?,
           note = ?, dedupe_key = ?, revision = revision + 1, updated_at = ? WHERE id = ?`
      )
      .run(...contentColumns(content), dedupeKey({ ...content, source: JSON.parse(row.source) }), now, id)
    return this.get(id)!
  }

  /** A content edit that changes what is tested: a new card with fresh scheduling, from the same source. */
  saveAsNew(id: string, content: CardContent, scheduler: Scheduler): Card {
    const card = this.get(id)
    if (!card) throw new Error('That card no longer exists.')
    const result = this.save({ ...content, language: card.language, source: card.source, explanation: card.explanation }, scheduler, {
      again: true
    })
    return 'saved' in result ? result.saved : result.duplicate
  }

  /** Paused cards stay out of reviews; their due date is kept, so resuming may make them overdue. */
  setPaused(id: string, paused: boolean, now = Date.now()): void {
    database().prepare('UPDATE cards SET paused = ?, updated_at = ? WHERE id = ?').run(paused ? 1 : 0, now, id)
  }

  /** Deletes a card; restore() brings it back within UNDO_DELETE_MS, purge() removes it for good. */
  remove(id: string, now = Date.now()): void {
    database().prepare('UPDATE cards SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, id)
  }

  restore(id: string): void {
    database().prepare('UPDATE cards SET deleted_at = NULL WHERE id = ?').run(id)
  }

  /** Removes deleted cards (and, through the foreign key, their reviews) once they can't be undone. */
  purge(now = Date.now()): void {
    database().prepare('DELETE FROM cards WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(now - UNDO_DELETE_MS)
  }

  /** Everything needed to restore cards with working schedules: card rows and every review. */
  backup(scheduler: Scheduler): Backup {
    const cards = database().prepare('SELECT * FROM cards WHERE deleted_at IS NULL').all() as CardRow[]
    const reviews = database()
      .prepare('SELECT reviews.* FROM reviews JOIN cards ON cards.id = reviews.card_id WHERE cards.deleted_at IS NULL')
      .all() as ReviewRow[]
    return { format: 'duet-backup', version: 1, exportedAt: Date.now(), scheduler: scheduler.config, cards, reviews }
  }

  /** Adds the backup's cards and reviews that are not here yet; existing ones are left alone. Every
   * row is checked first, so a damaged file is refused whole rather than half restored. */
  restoreBackup(file: unknown): { cards: number; reviews: number } {
    const backup = checkBackup(file)
    const db = database()
    const known = new Set(backup.cards.map((row) => row.id))
    for (const row of backup.reviews)
      if (!known.has(row.card_id) && !db.prepare('SELECT 1 FROM cards WHERE id = ?').get(row.card_id))
        throw new Error('That backup has reviews for cards it does not contain.')
    return transaction(() => {
      let cards = 0
      let reviews = 0
      // A card deleted here moments ago (still undoable) is replaced by the backup's copy.
      const dropDeleted = db.prepare('DELETE FROM cards WHERE id = ? AND deleted_at IS NOT NULL')
      const insertCard = db.prepare(
        `INSERT INTO cards (id, revision, type, language, expression, reading, meaning, target, situation,
           alternative, note, source, explanation, dedupe_key, paused, deleted_at, fsrs, fsrs_version, state, due,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`
      )
      for (const row of backup.cards) {
        dropDeleted.run(row.id)
        cards += Number(
          insertCard.run(row.id, row.revision, row.type, row.language, row.expression, row.reading, row.meaning, row.target,
            row.situation, row.alternative, row.note, row.source, row.explanation, row.dedupe_key, row.paused, row.fsrs,
            row.fsrs_version, row.state, row.due, row.created_at, row.updated_at).changes
        )
      }
      const insertReview = db.prepare(
        `INSERT INTO reviews (id, card_id, card_revision, rating, reviewed_at, study_day, was_new, before, after,
           log, scheduler, undone_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`
      )
      for (const row of backup.reviews)
        reviews += Number(
          insertReview.run(row.id, row.card_id, row.card_revision, row.rating, row.reviewed_at, row.study_day, row.was_new,
            row.before, row.after, row.log, row.scheduler, row.undone_at).changes
        )
      return { cards, reviews }
    })
  }

  /** A plain table (tab-separated) for spreadsheets or other apps. Scheduling does not carry over. */
  textExport(): string {
    const clean = (text: string | undefined): string => (text ?? '').replace(/[\t\n\r]+/g, ' ').trim()
    const header = ['type', 'expression', 'reading', 'meaning', 'target', 'situation', 'alternative', 'note', 'video', 'seconds', 'created']
    const rows = this.list().map((card) => {
      const video = card.source.kind === 'video' ? card.source.moment.video : undefined
      return [card.type, card.expression, card.reading, card.meaning, card.target, card.situation, card.alternative, card.note,
        video?.url, video?.position !== undefined ? String(Math.floor(video.position)) : '', new Date(card.createdAt).toISOString()].map(clean)
    })
    return [header, ...rows].map((row) => row.join('\t')).join('\n') + '\n'
  }
}

export type Backup = {
  format: 'duet-backup'
  version: 1
  exportedAt: number
  scheduler: Scheduler['config']
  cards: CardRow[]
  reviews: ReviewRow[]
}

// What a backup's rows must look like. JSON columns are checked by reading them the way the app
// will: a row the app could not show is refused at restore, not discovered later.
const nonEmpty = z.string().min(1)
const optionalText = z.string().nullable()
const integer = z.number().int()
const json = (check: (value: unknown) => unknown): z.ZodType<string> =>
  z.string().refine((value) => {
    try {
      check(JSON.parse(value))
      return true
    } catch {
      return false
    }
  })
const fsrsState = z.string().refine((value) => {
  try {
    return !Number.isNaN(revive(value).due.getTime())
  } catch {
    return false
  }
})
const CardRowSchema = z.object({
  id: nonEmpty,
  revision: integer.min(1),
  type: z.enum(['understand', 'use']),
  language: z.enum(LANGUAGE_CODES),
  expression: nonEmpty,
  reading: optionalText,
  meaning: nonEmpty,
  target: nonEmpty,
  situation: optionalText,
  alternative: optionalText,
  note: optionalText,
  source: json((value) => {
    const source = value as CardSource
    if (source.kind === 'video' ? typeof source.moment?.line?.original !== 'string' || !source.moment.video?.site : source.kind !== 'tutor')
      throw new Error('bad source')
  }),
  explanation: json((value) => {
    if (value !== null && typeof (value as { meaning?: unknown }).meaning !== 'string') throw new Error('bad explanation')
  }).nullable(),
  dedupe_key: nonEmpty,
  paused: z.union([z.literal(0), z.literal(1)]),
  deleted_at: z.number().nullable().optional(),
  fsrs: fsrsState,
  fsrs_version: nonEmpty,
  state: z.number().int().min(0).max(3),
  due: z.number(),
  created_at: z.number(),
  updated_at: z.number()
})
const ReviewRowSchema = z.object({
  id: nonEmpty,
  card_id: nonEmpty,
  card_revision: integer,
  rating: z.number().int().min(1).max(4),
  reviewed_at: z.number(),
  study_day: nonEmpty,
  was_new: z.union([z.literal(0), z.literal(1)]),
  before: fsrsState,
  after: fsrsState,
  log: json(() => undefined),
  scheduler: json(() => undefined),
  undone_at: z.number().nullable()
})
const BackupSchema = z.object({
  format: z.literal('duet-backup'),
  version: z.literal(1),
  cards: z.array(CardRowSchema),
  reviews: z.array(ReviewRowSchema)
})

const NOT_A_BACKUP = 'That file is not a Duet backup, or it is damaged.'

/** A backup file's text, read as JSON (checked when restored); a file that isn't JSON is refused in
 * the same plain words as one that isn't a backup. */
export function readBackup(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(NOT_A_BACKUP)
  }
}

function checkBackup(value: unknown): Pick<Backup, 'cards' | 'reviews'> {
  const result = BackupSchema.safeParse(value)
  if (!result.success) throw new Error(NOT_A_BACKUP)
  return result.data as Pick<Backup, 'cards' | 'reviews'>
}

export type { CardRow, ReviewRow }
