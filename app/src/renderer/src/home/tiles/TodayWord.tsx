// Today's word, drawn as its word page draws it (Your words › Words), without the step: the word in
// syllables, its sound and part of speech, the meaning, and the line it was last heard in.
import { useEffect, useState } from 'react'
import type { WordView } from '../../../../shared/flashcards'
import type { HomeToday } from '../../../../shared/home'
import type { Language } from '../../../../shared/types'
import { Entry } from '../flashcards/Entry'

type Word = NonNullable<HomeToday['word']>

export function TodayWord({ word }: { word: Word }): React.JSX.Element {
  const language = word.key.split(':')[0] as Language
  const [view, setView] = useState<WordView>()
  useEffect(() => {
    let current = true
    window.duet.flashcards.word(language, word.key).then(
      (found) => current && setView(found),
      () => undefined
    )
    return () => {
      current = false
    }
  }, [language, word.key])
  return (
    <section className="today-word" aria-label="Your word for today">
      <span className="label">Your word for today</span>
      {view ? (
        <div className="fc fc-in-tile">
          <div className="fc-detail">
            <Entry
              data={{ ...view, byDuet: view.cards[0]?.example?.byDuet }}
              onReplay={
                view.lastHeard?.replayable
                  ? () => void window.duet.flashcards.replay(language, word.key)
                  : undefined
              }
            />
          </div>
        </div>
      ) : (
        // Until the word page's view is in: the word and its meaning.
        <>
          <span className="word-large" data-k={word.state}>
            {word.word}
          </span>
          <p>{word.meaning}</p>
        </>
      )}
    </section>
  )
}
