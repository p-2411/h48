// My cards: every saved card (All cards) and scheduled review (Review), plus backup and export.
import { useEffect, useState } from 'react'
import type { Card, CardDetail, CardQuery } from '../../../shared/cards'
import { CardList } from './CardList'
import { CardView } from './CardView'
import { Review } from './Review'

const UNDO_MS = 8000

export function MyCards(): React.JSX.Element {
  const [tab, setTab] = useState<'all' | 'review'>('all')
  const [query, setQuery] = useState<CardQuery>({ show: 'all' })
  const [cards, setCards] = useState<Card[]>([])
  const [selected, setSelected] = useState<string>()
  const [detail, setDetail] = useState<CardDetail>()
  const [deleted, setDeleted] = useState<string>()
  const [message, setMessage] = useState<string>()

  // The list and the open card, loaded again whenever the query, the selection or any card changes.
  useEffect(() => {
    let live = true
    const load = (): Promise<void> =>
      Promise.all([window.duet.cards.list(query), selected ? window.duet.cards.get(selected) : undefined]).then(([list, card]) => {
        if (!live) return
        setCards(list)
        setDetail(card)
      })
    void load()
    const stop = window.duet.cards.onChanged(() => void load())
    return () => {
      live = false
      stop()
    }
  }, [query, selected])

  useEffect(
    () =>
      window.duet.cards.onShow((id) => {
        setTab('all')
        setQuery({ show: 'all' })
        setSelected(id)
      }),
    []
  )

  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => setDeleted(undefined), UNDO_MS)
    return () => clearTimeout(timer)
  }, [deleted])

  const file = async (work: () => Promise<unknown>, done: (result: never) => string | undefined): Promise<void> => {
    try {
      const result = await work()
      if (result !== undefined) setMessage(done(result as never))
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'That did not work.')
    }
  }

  return (
    <main className="my-cards">
      <header className="top">
        <div className="segment" role="tablist">
          <button type="button" role="tab" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>
            All cards
          </button>
          <button type="button" role="tab" aria-pressed={tab === 'review'} onClick={() => setTab('review')}>
            Review
          </button>
        </div>
        <div className="row">
          <button type="button" className="btn quiet" onClick={() => file(window.duet.cards.exportBackup, (path: string) => `Backup saved to ${path}.`)}>
            Back up
          </button>
          <button type="button" className="btn quiet" onClick={() => file(window.duet.cards.restoreBackup, (added: { cards: number; reviews: number }) => `Restored ${added.cards} cards and ${added.reviews} reviews.`)}>
            Restore
          </button>
          <button type="button" className="btn quiet" onClick={() => file(window.duet.cards.exportText, (path: string) => `Exported to ${path}. The schedule is not included.`)}>
            Export text
          </button>
        </div>
      </header>
      {message && (
        <p className="notice row">
          <span>{message}</span>
          <button type="button" className="btn quiet" onClick={() => setMessage(undefined)}>
            OK
          </button>
        </p>
      )}
      {deleted && (
        <p className="notice row">
          <span>Card deleted.</span>
          <button
            type="button"
            className="btn quiet"
            onClick={async () => {
              await window.duet.cards.restore(deleted)
              setSelected(deleted)
              setDeleted(undefined)
            }}
          >
            Undo
          </button>
        </p>
      )}
      <p className="faint">Cards are kept on this computer only. Back up to keep a copy.</p>

      {tab === 'review' ? (
        <Review onBrowse={() => setTab('all')} />
      ) : (
        <div className="browse">
          <CardList cards={cards} query={query} onQuery={setQuery} selected={selected} onSelect={setSelected} />
          {detail ? (
            <CardView
              key={detail.id}
              card={detail}
              onDeleted={(id) => {
                setDeleted(id)
                setSelected(undefined)
              }}
            />
          ) : (
            <p className="faint pick">Pick a card to see it.</p>
          )}
        </div>
      )}
    </main>
  )
}
