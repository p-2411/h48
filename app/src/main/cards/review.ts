// A review session: which card comes next, what each rating would do, and committing ratings.
//
// Order: learning and relearning cards that are due, then review cards that are due, then new
// cards within today's allowance. Cards due later are never served early. Two new cards from the
// same line are not introduced in the same session. A new card counts against the allowance on its
// first rating (not when saved or shown), and undoing that rating gives the place back.
//
// Every rating is one transaction: the review row (with the scheduler state before and after) and
// the card's new state. A rating only applies to the exact card state that was shown, and each
// submission has its own id, so a double click or a stale window can't apply a review twice.
// Undo restores the state before the latest rating of this session and marks that review undone;
// it never adds an opposite rating.
import type { Card, Rating, ReviewQueue, ReviewSettings } from '../../shared/cards'
import { database, transaction } from '../store/db'
import { revive, ratingNumber, Scheduler, serialize, type Outcome } from './scheduler'
import { sourceKey, type CardRow, type CardStore, type ReviewRow } from './store'

// The study day rolls over at 04:00 local time, so a late-night session counts as the same day.
const ROLLOVER_HOUR = 4
// Outcomes worked out when a card was shown are saved only if rated soon after.
const SHOWN_FOR_MS = 10 * 60_000

function studyDayStart(now: number): Date {
  const start = new Date(now)
  if (start.getHours() < ROLLOVER_HOUR) start.setDate(start.getDate() - 1)
  start.setHours(ROLLOVER_HOUR, 0, 0, 0)
  return start
}

export function studyDay(now: number): string {
  const start = studyDayStart(now)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

function studyDayEnd(now: number): number {
  const end = studyDayStart(now)
  end.setDate(end.getDate() + 1)
  return end.getTime()
}

/** "<1 min", "10 min", "3 h", "4 d", "2 mo", "1.5 y": how long until a due date. */
export function interval(ms: number): string {
  const minutes = ms / 60_000
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)} h`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)} d`
  if (days < 365) return `${Math.round(days / 30)} mo`
  return `${Math.round((days / 365) * 10) / 10} y`
}

export class StaleReviewError extends Error {}

export class ReviewSession {
  private skipped = new Set<string>()
  private introduced = new Set<string>()
  private rated: string[] = []
  private shown?: {
    card: Card
    fsrs: string
    outcomes: Record<Rating, Outcome>
    at: number
    scheduler: Scheduler
  }

  constructor(
    private store: CardStore,
    private scheduler: () => Scheduler,
    private settings: () => ReviewSettings
  ) {}

  /** Starts over: forgets skips and what can be undone. */
  restart(): void {
    this.skipped.clear()
    this.introduced.clear()
    this.rated = []
    this.shown = undefined
  }

  private show(row: CardRow, now: number): NonNullable<ReviewQueue['next']> {
    const card = this.store.get(row.id)!
    const scheduler = this.scheduler()
    const outcomes = scheduler.outcomes(revive(row.fsrs), now)
    this.shown = { card, fsrs: row.fsrs, outcomes, at: now, scheduler }
    return {
      card,
      outcomes: Object.fromEntries(
        (Object.keys(outcomes) as Rating[]).map((rating) => {
          const dueAt = outcomes[rating].card.due.getTime()
          return [rating, { due: dueAt, interval: interval(dueAt - now) }]
        })
      ) as Record<Rating, { due: number; interval: string }>
    }
  }

  /** Shows one explicitly requested card for a voice review, while preserving the same due/new
   * eligibility rules and stale-write protection as the normal review queue. */
  present(cardId: string, now = Date.now()): NonNullable<ReviewQueue['next']> {
    const db = database()
    const row = db
      .prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL AND paused = 0')
      .get(cardId) as CardRow | undefined
    if (!row) throw new Error('CARD_NOT_FOUND')
    if (row.state !== 0 && row.due > now) throw new Error('CARD_NOT_DUE')
    if (row.state === 0) {
      const introducedToday = (
        db
          .prepare(
            'SELECT COUNT(*) n FROM reviews WHERE was_new = 1 AND undone_at IS NULL AND study_day = ?'
          )
          .get(studyDay(now)) as { n: number }
      ).n
      if (introducedToday >= this.settings().newPerDay) throw new Error('NEW_CARD_LIMIT_REACHED')
      if (this.introduced.has(sourceKey(JSON.parse(row.source), row.expression)))
        throw new Error('SIBLING_CARD_DEFERRED')
    }
    return this.show(row, now)
  }

  queue(now = Date.now()): ReviewQueue {
    const db = database()
    const count = (sql: string, ...values: (string | number)[]): number =>
      (db.prepare(sql).get(...values) as { n: number }).n
    const live = 'deleted_at IS NULL AND paused = 0'
    const due = count(`SELECT COUNT(*) n FROM cards WHERE ${live} AND state != 0 AND due <= ?`, now)
    const laterToday = count(
      `SELECT COUNT(*) n FROM cards WHERE ${live} AND state != 0 AND due > ? AND due < ?`,
      now,
      studyDayEnd(now)
    )
    const newCards = count(`SELECT COUNT(*) n FROM cards WHERE ${live} AND state = 0`)
    const introducedToday = count(
      'SELECT COUNT(*) n FROM reviews WHERE was_new = 1 AND undone_at IS NULL AND study_day = ?',
      studyDay(now)
    )
    const newAvailable = Math.min(
      newCards,
      Math.max(0, this.settings().newPerDay - introducedToday)
    )

    const candidates = [
      ...(db
        .prepare(`SELECT * FROM cards WHERE ${live} AND state IN (1, 3) AND due <= ? ORDER BY due`)
        .all(now) as CardRow[]),
      ...(db
        .prepare(`SELECT * FROM cards WHERE ${live} AND state = 2 AND due <= ? ORDER BY due`)
        .all(now) as CardRow[]),
      ...(newAvailable > 0
        ? (db
            .prepare(`SELECT * FROM cards WHERE ${live} AND state = 0 ORDER BY created_at`)
            .all() as CardRow[])
        : [])
    ]
    const nextRow = candidates.find(
      (row) =>
        !this.skipped.has(row.id) &&
        !(row.state === 0 && this.introduced.has(sourceKey(JSON.parse(row.source), row.expression)))
    )
    this.shown = undefined
    const next = nextRow ? this.show(nextRow, now) : undefined
    const nextDue = next
      ? undefined
      : (
          db
            .prepare(`SELECT MIN(due) n FROM cards WHERE ${live} AND state != 0 AND due > ?`)
            .get(now) as { n: number | null }
        ).n
    return {
      counts: { due, laterToday, newAvailable },
      next,
      nextDueAt: nextDue ?? undefined,
      canUndo: this.rated.length > 0
    }
  }

  /** Commits a rating for the card shown. `eventId` is the submission's own id. */
  rate(
    cardId: string,
    revision: number,
    rating: Rating,
    eventId: string,
    now = Date.now()
  ): ReviewQueue {
    const db = database()
    if (db.prepare('SELECT 1 FROM reviews WHERE id = ?').get(eventId)) return this.queue(now)
    const shown = this.shown
    const row = db
      .prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL')
      .get(cardId) as CardRow | undefined
    if (
      !shown ||
      !row ||
      shown.card.id !== cardId ||
      row.revision !== revision ||
      row.fsrs !== shown.fsrs
    )
      throw new StaleReviewError(
        'This card changed since it was shown. The queue has been refreshed.'
      )
    // Shown too long ago, on another study day, or before the settings changed: show it afresh.
    if (
      now - shown.at > SHOWN_FOR_MS ||
      studyDay(now) !== studyDay(shown.at) ||
      shown.scheduler !== this.scheduler()
    )
      throw new StaleReviewError('That card was on screen a while. Here it is again, up to date.')
    const outcome = shown.outcomes[rating]
    const after = serialize(outcome.card)
    transaction(() => {
      db.prepare(
        `INSERT INTO reviews (id, card_id, card_revision, rating, reviewed_at, study_day, was_new, before, after, log, scheduler)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eventId,
        cardId,
        revision,
        ratingNumber(rating),
        now,
        studyDay(now),
        row.state === 0 ? 1 : 0,
        row.fsrs,
        after,
        JSON.stringify(outcome.log),
        JSON.stringify(shown.scheduler.config)
      )
      db.prepare('UPDATE cards SET fsrs = ?, state = ?, due = ?, updated_at = ? WHERE id = ?').run(
        after,
        outcome.card.state,
        outcome.card.due.getTime(),
        now,
        cardId
      )
    })
    this.rated.push(eventId)
    if (row.state === 0) this.introduced.add(sourceKey(JSON.parse(row.source), row.expression))
    return this.queue(now)
  }

  /** Leaves the card out of this session only; it stays due and gets no rating. */
  skip(cardId: string, now = Date.now()): ReviewQueue {
    this.skipped.add(cardId)
    return this.queue(now)
  }

  /** Undoes the latest rating of this session, if nothing has reviewed that card since. */
  undo(now = Date.now()): ReviewQueue {
    const eventId = this.rated[this.rated.length - 1]
    if (!eventId) return this.queue(now)
    const db = database()
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(eventId) as
      ReviewRow | undefined
    const card =
      review &&
      (db.prepare('SELECT * FROM cards WHERE id = ?').get(review.card_id) as CardRow | undefined)
    if (!review || !card || card.fsrs !== review.after) {
      this.rated.pop()
      throw new StaleReviewError(
        'That card has been reviewed again since, so the rating can no longer be undone.'
      )
    }
    const before = revive(review.before)
    transaction(() => {
      db.prepare('UPDATE cards SET fsrs = ?, state = ?, due = ?, updated_at = ? WHERE id = ?').run(
        review.before,
        before.state,
        before.due.getTime(),
        now,
        card.id
      )
      db.prepare('UPDATE reviews SET undone_at = ? WHERE id = ?').run(now, eventId)
    })
    this.rated.pop()
    if (review.was_new) this.introduced.delete(sourceKey(JSON.parse(card.source), card.expression))
    this.skipped.delete(card.id)
    return this.queue(now)
  }
}
