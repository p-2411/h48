// Checks the wording and decisions My cards and Review make from plain data: what a restored backup
// says (renderer/cards/backup.ts) and when an empty review queue may mean no cards at all
// (renderer/review/queue.ts). Run: npx jiti scripts/test-cards-ui.mjs
import { restoredText } from '../src/renderer/src/cards/backup.ts'
import { mightHaveNoCards } from '../src/renderer/src/review/queue.ts'

const check = (ok, what) => {
  if (!ok) throw new Error(what)
}
const same = (actual, expected) =>
  check(actual === expected, `gave ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)

// A restore merges (cards already here are kept), so it says what it added, never "Restored".
same(restoredText({ cards: 3, reviews: 12 }), 'Added 3 cards and 12 reviews from the backup.')
same(restoredText({ cards: 1, reviews: 1 }), 'Added 1 card and 1 review from the backup.')
same(restoredText({ cards: 0, reviews: 2 }), 'Added 0 cards and 2 reviews from the backup.')
same(restoredText({ cards: 0, reviews: 0 }), 'Nothing new in that backup.')

const queue = (counts, rest = {}) => ({
  counts: { due: 0, newAvailable: 0, laterToday: 0, ...counts },
  canUndo: false,
  ...rest
})
// Nothing due, new, later or ahead: maybe no cards (the hook then checks for any card).
check(
  mightHaveNoCards(queue({})),
  'an all-zero queue with no next date was not treated as maybe no cards'
)
// Any sign of a card means there are cards: "Nothing to review right now".
check(
  !mightHaveNoCards(queue({}, { nextDueAt: Date.now() + 60_000 })),
  'a queue with a next due date was treated as no cards'
)
check(
  !mightHaveNoCards(queue({ laterToday: 1 })),
  'a queue with cards later today was treated as no cards'
)
check(
  !mightHaveNoCards(queue({ newAvailable: 2 })),
  'a queue with new cards was treated as no cards'
)
check(!mightHaveNoCards(queue({ due: 1 })), 'a queue with due cards was treated as no cards')
check(
  !mightHaveNoCards(queue({}, { next: { card: {}, outcomes: {} } })),
  'a queue with a card to show was treated as no cards'
)

console.log('cards ui: ok')
