import type { ReviewQueue } from '../../../shared/cards'

/** Whether an empty queue might mean there are no cards at all, rather than none due: nothing is
 * due, new or coming later, and there is no next due date. (It can also mean every card is paused,
 * or all are new and today's new cards are used up, so the caller checks for any card.) */
export function mightHaveNoCards(queue: ReviewQueue): boolean {
  const { due, newAvailable, laterToday } = queue.counts
  return (
    !queue.next &&
    due === 0 &&
    newAvailable === 0 &&
    laterToday === 0 &&
    queue.nextDueAt === undefined
  )
}
