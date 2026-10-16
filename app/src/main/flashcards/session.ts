// A review on the flashcards page: today's cards (every collection mixed), one video's, or one
// word's cards practised off schedule. Scheduled sessions run on the cards' own review engine
// (src/main/cards/review.ts), so ratings, undo and stale-card protection are the same as everywhere:
// the learner answers Forgot or Got it, and Duet rates the card from how it went (inferRating).
// Practise now reschedules nothing.
import { randomUUID } from 'crypto'
import type { Card } from '../../shared/cards'
import {
  comesBack,
  inferRating,
  STEPS,
  type AnswerSignals,
  type FlashcardView,
  type SessionScope,
  type SessionState,
  type Step,
  cardKey
} from '../../shared/flashcards'
import type { ReviewSession } from '../cards/review'
import type { CardStore } from '../cards/store'
import { database } from '../store/db'

export type SessionDeps = {
  store: CardStore
  /** A fresh review session over the collection (Cards.newSession). */
  newReview: () => ReviewSession
  /** The card as the page shows it. */
  view: (card: Card) => Promise<FlashcardView>
  /** The step of a card's word now. */
  stepOf: (card: Card) => Step
  /** Ratings changed the cards. */
  changed: () => void
  /** The live cards in a collection (a pile on Collections). */
  collectionIds: (id: string) => string[]
}

// Cards that can be reviewed: not deleted and not paused.
const LIVE = 'deleted_at IS NULL AND paused = 0'

/** The live cards from one video (site:id, as the watch log names videos). */
export function videoCardIds(video: string): string[] {
  const rows = database().prepare(`SELECT id, source FROM cards WHERE ${LIVE}`).all() as {
    id: string
    source: string
  }[]
  return rows
    .filter((row) => {
      try {
        const source = JSON.parse(row.source)
        return (
          source.kind === 'video' &&
          `${source.moment.video.site}:${source.moment.video.id ?? source.moment.video.url ?? ''}` ===
            video
        )
      } catch {
        return false
      }
    })
    .map((row) => row.id)
}

export class FlashcardSession {
  private scope: SessionScope = { kind: 'today' }
  private review?: ReviewSession
  private only?: Set<string>
  /** Practise now: the word's cards, in order, and where the session is. */
  private practise: string[] = []
  private at = 0
  private total = 0
  private done = 0
  private climbed = new Set<string>()
  /** The cards answered, latest last, for Undo. */
  private answeredIds: string[] = []
  private current?: FlashcardView

  constructor(private readonly deps: SessionDeps) {}

  async start(scope: SessionScope, now = Date.now()): Promise<SessionState> {
    this.scope = scope
    this.done = 0
    this.climbed.clear()
    this.answeredIds = []
    this.current = undefined
    this.review = undefined
    this.only = undefined
    this.practise = []
    this.at = 0
    if (scope.kind === 'practise') {
      this.practise = this.deps.store
        .list({ show: 'all' })
        .filter((card) => cardKey(card) === scope.key)
        .map((card) => card.id)
      this.total = this.practise.length
    } else {
      this.review = this.deps.newReview()
      this.review.restart()
      if (scope.kind === 'video') this.only = new Set(videoCardIds(scope.video))
      if (scope.kind === 'collection') this.only = new Set(this.deps.collectionIds(scope.id))
      this.total = this.waiting(now)
      if (scope.kind === 'today' && scope.limit) this.total = Math.min(this.total, scope.limit)
    }
    return this.next(undefined, now)
  }

  /** The cards waiting in this session's scope now: due ones, and new ones within today's allowance. */
  private waiting(now: number): number {
    const queue = this.review!.queue(now)
    const { due, newAvailable } = queue.counts
    if (!this.only) return due + newAvailable
    const ids = [...this.only]
    if (!ids.length) return 0
    const marks = ids.map(() => '?').join(',')
    const count = (sql: string, ...values: (string | number)[]): number =>
      (
        database()
          .prepare(sql)
          .get(...values) as { n: number }
      ).n
    const dueHere = count(
      `SELECT COUNT(*) n FROM cards WHERE ${LIVE} AND state != 0 AND due <= ? AND id IN (${marks})`,
      now,
      ...ids
    )
    const newHere = count(
      `SELECT COUNT(*) n FROM cards WHERE ${LIVE} AND state = 0 AND id IN (${marks})`,
      ...ids
    )
    return dueHere + Math.min(newHere, newAvailable)
  }

  private async next(answered: SessionState['answered'], now: number): Promise<SessionState> {
    let card: Card | undefined
    if (this.scope.kind === 'practise') {
      const id = this.practise[this.at]
      card = id ? this.deps.store.get(id) : undefined
    } else if (this.scope.kind === 'today' && this.scope.limit && this.done >= this.scope.limit) card = undefined
    else card = this.review!.queue(now, this.only).next?.card
    this.current = card ? await this.deps.view(card) : undefined
    return this.state(answered)
  }

  state(answered?: SessionState['answered']): SessionState {
    return {
      scope: this.scope,
      next: this.current,
      done: this.done,
      // The total never reads less than what's been done and what's on screen.
      total: Math.max(this.total, this.done + (this.current ? 1 : 0)),
      canUndo: this.answeredIds.length > 0,
      answered,
      climbed: this.climbed.size
    }
  }

  /** Forgot or Got it on the card shown. */
  async answer(cardId: string, signals: AnswerSignals, now = Date.now()): Promise<SessionState> {
    const shown = this.current
    if (!shown || shown.card.id !== cardId)
      throw new Error('That card is no longer the one on screen. Here is where the review is now.')
    const word = shown.word
    if (this.scope.kind === 'practise') {
      this.at++
      this.done++
      this.answeredIds.push(cardId)
      return this.next({ word }, now)
    }
    const before = shown.step
    const rating = inferRating(signals, shown.card)
    this.review!.commitRating(cardId, shown.card.revision, rating, randomUUID(), now)
    this.done++
    this.answeredIds.push(cardId)
    const after = this.deps.store.get(cardId)
    const step = after ? this.deps.stepOf(after) : before
    const climbedTo = STEPS.indexOf(step) > STEPS.indexOf(before) ? step : undefined
    if (climbedTo) this.climbed.add(cardKey(shown.card))
    this.deps.changed()
    return this.next(
      { word, comesBack: after ? comesBack(after.due, now) : undefined, climbed: climbedTo },
      now
    )
  }

  /** Back to the last card answered, taking its answer back. */
  async undo(now = Date.now()): Promise<SessionState> {
    const last = this.answeredIds[this.answeredIds.length - 1]
    if (!last) return this.state()
    if (this.scope.kind === 'practise') {
      this.answeredIds.pop()
      this.at = Math.max(0, this.at - 1)
      this.done = Math.max(0, this.done - 1)
      return this.next(undefined, now)
    }
    // Undo restores the card as it was; it is due again, so it can be shown straight away.
    this.review!.undo(now)
    this.answeredIds.pop()
    this.done = Math.max(0, this.done - 1)
    const card = this.deps.store.get(last)
    if (card) this.climbed.delete(cardKey(card))
    this.deps.changed()
    const shown = card && this.review!.present(card.id, now)
    this.current = shown ? await this.deps.view(shown.card) : undefined
    if (!this.current) return this.next(undefined, now)
    return this.state()
  }
}
