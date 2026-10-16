// What Your words shows from the main process: the ladder's words for the language learnt and every
// card, loaded together; again when the window comes back to the front, when a word moves on the
// ladder and when a card changes. A failed reload keeps what was shown. Also the full cards (with
// their review history) of the word that is open.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card } from '../../../../shared/cards'
import type { WordsSummary } from '../../../../shared/knowledge'
import type { Language } from '../../../../shared/types'
import { say } from '../../components/errors'

export type WordsData = {
  language: Language
  summary: WordsSummary
  cards: Card[]
  /** When it was loaded (what is due is worked out against it). */
  at: number
}

export function useWordsData(language?: Language): {
  data?: WordsData
  error?: string
  reload: () => void
} {
  const [data, setData] = useState<WordsData>()
  const [error, setError] = useState<string>()
  // Only the latest load counts: an older one that answers late is dropped.
  const latest = useRef(0)
  const reload = useCallback(() => {
    if (!language) return
    const load = ++latest.current
    Promise.all([
      window.duet.knowledge.summary(language),
      window.duet.cards.list({ show: 'all' })
    ]).then(
      ([summary, cards]) => {
        if (load !== latest.current) return
        setData({ language, summary, cards, at: Date.now() })
        setError(undefined)
      },
      (cause) => {
        if (load === latest.current) setError(say(cause, 'Could not load your words.'))
      }
    )
  }, [language])
  useEffect(() => {
    reload()
    const offWords = window.duet.knowledge.onChanged(reload)
    const offCards = window.duet.cards.onChanged(reload)
    window.addEventListener('focus', reload)
    return () => {
      offWords()
      offCards()
      window.removeEventListener('focus', reload)
    }
  }, [reload])
  // Another language's words are not shown while this one's load.
  return { data: data?.language === language ? data : undefined, error, reload }
}
