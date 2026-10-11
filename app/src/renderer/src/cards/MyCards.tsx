// My cards: every saved card, to browse, edit, pause and delete, plus backup and export (in the ⋯
// menu). Review itself is in the side panel; the Review button opens it there.
import { useEffect, useState } from 'react'
import type { Card, CardDetail, CardQuery } from '../../../shared/cards'
import { CardList } from './CardList'
import { CardView } from './CardView'

const UNDO_MS = 8000

export function MyCards(): React.JSX.Element {
  const [due, setDue] = useState(0)
  const [menu, setMenu] = useState(false)
  const [query, setQuery] = useState<CardQuery>({ show: 'all' })
  const [cards, setCards] = useState<Card[]>([])
  const [selected, setSelected] = useState<string>()
  const [detail, setDetail] = useState<CardDetail>()
  const [deleted, setDeleted] = useState<string[]>([])
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    window.duet.getState().then((state) => setDue(state.due.due + state.due.newAvailable))
    return window.duet.onDue((counts) => setDue(counts.due + counts.newAvailable))
  }, [])

  // The list and the open card, loaded again whenever the query, the selection or any card changes.
  useEffect(() => {
    let live = true
    const load = (): Promise<void> =>
      Promise.all([
        window.duet.cards.list(query),
        selected ? window.duet.cards.get(selected) : undefined
      ]).then(([list, card]) => {
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
        setQuery({ show: 'all' })
        setSelected(id)
      }),
    []
  )

  // Each deleted card can be brought back for a few seconds.
  const forget = (id: string): void => setDeleted((ids) => ids.filter((item) => item !== id))
  const markDeleted = (id: string): void => {
    setDeleted((ids) => [...ids, id])
    setTimeout(() => forget(id), UNDO_MS)
  }

  const file = async (
    work: () => Promise<unknown>,
    done: (result: never) => string | undefined
  ): Promise<void> => {
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
        <h1>My cards</h1>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={due === 0}
            onClick={() => window.duet.cards.openReview()}
          >
            {due > 0 ? `Review ${due}` : 'Nothing to review'}
          </button>
          <div className="menu-wrap">
            <button
              type="button"
              className="btn quiet"
              aria-expanded={menu}
              aria-label="More"
              onClick={() => setMenu(!menu)}
            >
              ⋯
            </button>
            {menu && (
              <div className="menu" role="menu" onClick={() => setMenu(false)}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    file(
                      window.duet.cards.exportBackup,
                      (path: string) => `Backup saved to ${path}.`
                    )
                  }
                >
                  Back up cards…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    file(
                      window.duet.cards.restoreBackup,
                      (added: { cards: number; reviews: number }) =>
                        `Restored ${added.cards} cards and ${added.reviews} reviews.`
                    )
                  }
                >
                  Restore a backup…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    file(
                      window.duet.cards.exportText,
                      (path: string) => `Exported to ${path}. The schedule is not included.`
                    )
                  }
                >
                  Export as text…
                </button>
                <p className="faint">
                  Cards are kept on this computer only. Back up to keep a copy.
                </p>
              </div>
            )}
          </div>
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
      {deleted.map((id) => (
        <p key={id} className="notice row">
          <span>Card deleted.</span>
          <button
            type="button"
            className="btn quiet"
            onClick={async () => {
              await window.duet.cards.restore(id)
              setSelected(id)
              forget(id)
            }}
          >
            Undo
          </button>
        </p>
      ))}
      <div className="browse">
        <CardList
          cards={cards}
          query={query}
          onQuery={setQuery}
          selected={selected}
          onSelect={setSelected}
        />
        {detail ? (
          <CardView
            key={detail.id}
            card={detail}
            onDeleted={(id) => {
              markDeleted(id)
              setSelected(undefined)
            }}
          />
        ) : (
          <p className="faint pick">Pick a card to see it.</p>
        )}
      </div>
    </main>
  )
}
