// What the ⋯ menu says after a backup is restored. A restore adds what the backup has and this
// computer doesn't (cards already here are kept as they are), so it reports what was added.

const many = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`

export function restoredText(added: { cards: number; reviews: number }): string {
  if (added.cards === 0 && added.reviews === 0) return 'Nothing new in that backup.'
  return `Added ${many(added.cards, 'card')} and ${many(added.reviews, 'review')} from the backup.`
}
