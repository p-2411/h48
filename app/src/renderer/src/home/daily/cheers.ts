// What Duet says between the steps of Today's session, recorded once in Duet's own voice
// (scripts/record-welcome-voice.mjs records these with the first run's lines) and played with no API
// call. A line is picked by what comes next; a skipped step gets none.
export type CheerNext = 'cards' | 'challenge' | 'done'

export const CHEERS: Record<CheerNext, string[]> = {
  cards: ['Nice one. Now your cards.', 'Lovely. On to your cards.'],
  challenge: ['Good work. One challenge left.', 'Nicely done. Just one more.'],
  done: ['That’s today. Well done!', 'All done. See you tomorrow.']
}

/** The lines to record, in the recorder's form. */
export function cheerLines(): { lang: string; text: string; delivery: 'cheer' }[] {
  return Object.values(CHEERS)
    .flat()
    .map((text) => ({ lang: 'en-US', text, delivery: 'cheer' as const }))
}

/** A line for what comes next, not the same as the last one when there's a choice. */
export function pickCheer(next: CheerNext, last?: string): string {
  const lines = CHEERS[next].filter((line) => line !== last)
  return lines[Math.floor(Math.random() * lines.length)] ?? CHEERS[next][0]
}
