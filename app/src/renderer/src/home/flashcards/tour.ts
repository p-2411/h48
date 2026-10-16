// The stops of How cards work (Guide.tsx): where on the page each one is, and what it says.

/** A stop on the tour: the part of the page it's about, and what it says. The page underneath shows
 * the sample cards (sample.ts) while the tour runs. */
export type TourStop = {
  view: 'review' | 'words' | 'collections'
  /** On Review: today, or the sample review running. */
  mode: 'today' | 'session'
  /** The data-tour mark of what the stop points at; none for the closing reference. */
  target?: 'today' | 'card' | 'ladder' | 'word' | 'collections'
  title: string
  text: string
  /** The review's keys, shown on the stop about the card. */
  keys?: boolean
}

export const TOUR: TourStop[] = [
  {
    view: 'review',
    mode: 'today',
    target: 'today',
    title: 'Your cards for today.',
    text: 'Each day Duet gathers the cards that need you. These are sample words, just for this tour; yours come back after it.'
  },
  {
    view: 'review',
    mode: 'session',
    target: 'card',
    title: 'Every card asks one thing.',
    text: 'Try it: show the answer, then say if you got it. Duet works out how easy it was, and when the word comes back.',
    keys: true
  },
  {
    view: 'review',
    mode: 'today',
    target: 'ladder',
    title: 'Words climb four steps.',
    text: 'Know it when you hear it, recall it, say it, then use it. Forgetting brings a word back sooner. It never sends it down.'
  },
  {
    view: 'words',
    mode: 'today',
    target: 'word',
    title: 'Every word has a page.',
    text: 'The same entry as its card’s back: where you last heard it, and its tips. Practise now reviews it any time; Recall sooner brings it back more often.'
  },
  {
    view: 'collections',
    mode: 'today',
    target: 'collections',
    title: 'Collections and videos.',
    text: 'Decks you bring in become piles here, and By video keeps the words from each thing you watched. Your daily review mixes them all.'
  },
  {
    view: 'review',
    mode: 'today',
    title: 'Every kind of card.',
    text: 'The card changes as a word climbs. Each one explains itself the first time you meet it.'
  }
]
