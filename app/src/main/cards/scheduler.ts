// FSRS scheduling through ts-fsrs, pinned to one release. The only file that imports it, so a
// library upgrade is a change here plus a new SCHEDULER_VERSION.
//
// Card states are stored as the library returns them (JSON, versioned), never rebuilt by hand. The
// outcome of a rating is computed once, shown to the learner as the button's interval, and that same
// outcome is what gets saved: with fuzz on, computing it twice could give two different dates.
import { createEmptyCard, fsrs, FSRSVersion, generatorParameters, Rating as FsrsRating, State, TypeConvert, type Card, type Grade, type RecordLogItem } from 'ts-fsrs'
import type { CardState, Rating, ReviewSettings } from '../../shared/cards'

export const SCHEDULER_VERSION = 'ts-fsrs@5.4.2'

export type FsrsCard = Card
export type Outcome = RecordLogItem

const GRADES: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy
}

const STATES: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning'
}

export function ratingNumber(rating: Rating): number {
  return GRADES[rating]
}

export function ratingName(value: number): Rating {
  return (Object.keys(GRADES) as Rating[]).find((rating) => GRADES[rating] === value) ?? 'again'
}

export function stateName(state: State): CardState {
  return STATES[state]
}

export class Scheduler {
  private readonly scheduler

  constructor(private readonly settings: ReviewSettings) {
    // The library's own default weights and short-term (learning step) behaviour; only the target
    // retention is ours. Fuzz spreads out cards that would otherwise all come due together.
    this.scheduler = fsrs(
      generatorParameters({ request_retention: settings.desiredRetention, enable_fuzz: true, enable_short_term: true })
    )
  }

  /** Everything about this scheduler a review was made with, stored next to each review. */
  get config(): { version: string; fsrs: string; desiredRetention: number } {
    return { version: SCHEDULER_VERSION, fsrs: FSRSVersion, desiredRetention: this.settings.desiredRetention }
  }

  newCard(now: number): FsrsCard {
    return createEmptyCard(new Date(now))
  }

  /** What each rating would do to the card now. */
  outcomes(card: FsrsCard, now: number): Record<Rating, Outcome> {
    const preview = this.scheduler.repeat(card, new Date(now))
    return {
      again: preview[FsrsRating.Again],
      hard: preview[FsrsRating.Hard],
      good: preview[FsrsRating.Good],
      easy: preview[FsrsRating.Easy]
    }
  }
}

export function serialize(card: FsrsCard): string {
  return JSON.stringify(card)
}

/** A stored card state back into the library's shape (dates arrive as strings in JSON). */
export function revive(json: string): FsrsCard {
  return TypeConvert.card(JSON.parse(json))
}

/** The chance a card is remembered now (0 for a card never reviewed), for the knowledge ladder. */
export function retrievability(json: string, now: number): number {
  const card = revive(json)
  if (card.state === State.New) return 0
  return fsrs().get_retrievability(card, new Date(now), false)
}
