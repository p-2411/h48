// The cards My cards shows: the list for the search and filters, and the card that is open. Both
// load again whenever the query, the selection or any card changes.
import { useEffect, useState } from 'react'
import type { Card, CardDetail, CardQuery } from '../../../shared/cards'
import { say } from '../components/errors'

export type CardLibrary = {
  query: CardQuery
  setQuery: (query: CardQuery) => void
  /** Undefined until the first load has finished. */
  cards?: Card[]
  selected?: string
  setSelected: (id: string | undefined) => void
  detail?: CardDetail
  /** Why the last load failed, until a load works. */
  error?: string
  retry: () => void
}

export function useCardLibrary(): CardLibrary {
  const [query, setQuery] = useState<CardQuery>({ show: 'all' })
  const [cards, setCards] = useState<Card[]>()
  const [selected, setSelected] = useState<string>()
  const [detail, setDetail] = useState<CardDetail>()
  const [error, setError] = useState<string>()
  // Bumped by Try again, to run the load once more.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const load = (): Promise<void> =>
      Promise.all([
        window.duet.cards.list(query),
        selected ? window.duet.cards.get(selected) : undefined
      ]).then(
        ([list, card]) => {
          if (!live) return
          setCards(list)
          setDetail(card)
          setError(undefined)
        },
        (failure) => {
          if (live) setError(say(failure, 'Your cards could not be loaded.'))
        }
      )
    void load()
    const stop = window.duet.cards.onChanged(() => void load())
    return () => {
      live = false
      stop()
    }
  }, [query, selected, attempt])

  // Opened on one card (from Explain or the strip): show it, with no filters hiding it.
  useEffect(
    () =>
      window.duet.cards.onShow((id) => {
        setQuery({ show: 'all' })
        setSelected(id)
      }),
    []
  )

  return {
    query,
    setQuery,
    cards,
    selected,
    setSelected,
    detail,
    error,
    retry: () => setAttempt((count) => count + 1)
  }
}
