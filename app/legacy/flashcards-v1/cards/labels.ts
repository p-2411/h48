import type { Card } from '../../../shared/cards'
import { when } from '../components/time'

export function stateLabel(card: Card, now = Date.now()): string {
  if (card.paused) return 'Paused'
  if (card.state === 'new') return 'New'
  return card.due <= now ? 'Due' : `Due ${when(card.due)}`
}
