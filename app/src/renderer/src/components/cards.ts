import type { CardContent } from '../../../shared/cards'

/** Whether a card has what it needs to be saved: an expression, a meaning and a target. */
export function cardReady(card: CardContent): boolean {
  return !!(card.expression.trim() && card.meaning.trim() && card.target.trim())
}

export function contentOf(card: CardContent): CardContent {
  const { type, expression, reading, meaning, target, situation, alternative, note } = card
  return { type, expression, reading, meaning, target, situation, alternative, note }
}
