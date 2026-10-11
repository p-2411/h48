// Cards: expressions the learner chose to keep, scheduled for review with FSRS. These are the shapes
// the windows see; how cards are stored and scheduled lives in src/main/cards.
import type { Explanation } from './explain'
import type { Moment } from './moment'
import type { Language } from './types'

/** Understand: see the expression, recall what it means. Use it: see the situation, recall what to say. */
export type CardType = 'understand' | 'use'

/** What a card says. Everything here can be edited. */
export type CardContent = {
  type: CardType
  /** What is learnt, in the language learnt. */
  expression: string
  reading?: string
  meaning: string
  /** The one thing the card tests. */
  target: string
  situation?: string
  alternative?: string
  note?: string
}

/** Where a card came from: a moment in a video, or the tutor (which has no video time to give). */
export type CardSource = { kind: 'video'; moment: Moment } | { kind: 'tutor' }

export type CardDraft = CardContent & {
  language: Language
  source: CardSource
  explanation?: Explanation
}

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export type Card = CardDraft & {
  id: string
  /** Goes up on every edit. */
  revision: number
  paused: boolean
  state: CardState
  /** When the card is next due, in ms since 1970. */
  due: number
  lastReview?: number
  reps: number
  lapses: number
  createdAt: number
  updatedAt: number
}

/** The four review ratings, worst to best. The main process checks ratings against this list. */
export const RATINGS = ['again', 'hard', 'good', 'easy'] as const

export type Rating = (typeof RATINGS)[number]

/** Each rating as the learner sees it (on Review's buttons and in a card's history). */
export const RATING_LABELS: Record<Rating, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }

export type CardReview = { id: string; rating: Rating; reviewedAt: number; undone: boolean; dueAfter: number }

export type CardDetail = Card & { reviews: CardReview[] }

export type CardQuery = {
  search?: string
  show?: 'all' | 'new' | 'due' | 'paused'
  type?: CardType
  /** At most this many cards, newest first. */
  limit?: number
}

/** What saving a draft did: saved it, or found the same card already saved. */
export type SaveResult = { saved: Card } | { duplicate: Card }

export type ReviewSettings = {
  /** The share of cards FSRS aims for you to recall when they come due (0.9 = 90%). */
  desiredRetention: number
  /** New cards introduced per study day. */
  newPerDay: number
}

export type ReviewQueue = {
  counts: {
    /** Due now: learning, relearning and review cards. */
    due: number
    /** Coming due before the study day ends; not reviewable yet. */
    laterToday: number
    /** New cards still allowed today. */
    newAvailable: number
  }
  /** The card to review next, with what each rating would do. */
  next?: { card: Card; outcomes: Record<Rating, { due: number; interval: string }> }
  /** When nothing is due: when the next card comes due. */
  nextDueAt?: number
  /** Whether the latest rating in this session can be undone. */
  canUndo: boolean
}
