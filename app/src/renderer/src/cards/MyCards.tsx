// My cards: every saved card, to browse, edit, pause and delete, plus backup and export (in the ⋯
// menu). A place in the home base; its Review button opens Review there.
import { useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { say } from '../components/errors'
import type { HomeToday } from '../../../shared/home'
import { useLoaded } from '../home/useLoaded'
import { BackupMenu, type Notice } from './BackupMenu'
import { CardList } from './CardList'
import { CardView } from './CardView'
import { useCardLibrary } from './useCardLibrary'

const UNDO_MS = 8000

const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()

/** `onReview` opens Review (in the home base, inside Cards). */
export function MyCards({ onReview }: { onReview: () => void }): React.JSX.Element {
  const due = useLoaded(loadToday, 'Could not count the cards to review.').value?.due
  const library = useCardLibrary()
  const { cards, detail, setSelected } = library
  const [deleted, setDeleted] = useState<{ id: string; expression: string }[]>([])
  const [notice, setNotice] = useState<Notice>()

  // Each deleted card can be brought back for a few seconds; its Undo takes the focus (the card's
  // own buttons are gone).
  const forget = (id: string): void => setDeleted((items) => items.filter((item) => item.id !== id))
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])
  const lastUndo = useRef<HTMLButtonElement>(null)
  const undoCount = useRef(0)
  useEffect(() => {
    if (deleted.length > undoCount.current) lastUndo.current?.focus()
    undoCount.current = deleted.length
  }, [deleted.length])
  const markDeleted = (id: string, expression: string): void => {
    setDeleted((items) => [...items, { id, expression }])
    timers.current.push(window.setTimeout(() => forget(id), UNDO_MS))
  }
  const undoDelete = async (id: string): Promise<void> => {
    try {
      await window.duet.cards.restore(id)
      setSelected(id)
      forget(id)
    } catch (failure) {
      setNotice({ text: say(failure, 'That card could not be brought back.'), error: true })
    }
  }

  return (
    <main className="my-cards">
      <header className="top">
        <h1>My cards</h1>
        <div className="row">
          {/* Until the count is known it just says Review, not "Nothing to review". */}
          <button
            type="button"
            className="btn primary"
            disabled={due === 0}
            onClick={onReview}
          >
            {due === undefined ? 'Review' : due > 0 ? `Review ${due}` : 'Nothing to review'}
          </button>
          <BackupMenu onNotice={setNotice} />
        </div>
      </header>
      {notice && (
        <p
          className={notice.error ? 'notice error row' : 'notice row'}
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.text}</span>
          <button type="button" className="btn quiet" onClick={() => setNotice(undefined)}>
            OK
          </button>
        </p>
      )}
      {deleted.map(({ id, expression }, index) => (
        <p key={id} className="notice row" role="status">
          <span>Deleted “{expression}”.</span>
          <button
            ref={index === deleted.length - 1 ? lastUndo : undefined}
            type="button"
            className="btn quiet"
            onClick={() => undoDelete(id)}
          >
            Undo
          </button>
        </p>
      ))}
      {cards && (
        <p className="library-count">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'} shown · Stored on this computer
          only
        </p>
      )}
      <div className="browse">
        <CardList library={library} />
        {detail ? (
          // A card that breaks takes only its detail down; the list goes on.
          <ErrorBoundary key={detail.id} what="This card">
            <CardView
              card={detail}
              onDeleted={(id, expression) => {
                markDeleted(id, expression)
                setSelected(undefined)
              }}
              onSavedAsNew={(id) => {
                setSelected(id)
                setNotice({ text: 'Saved as a new card.' })
              }}
            />
          </ErrorBoundary>
        ) : (
          <p className="faint pick">Pick a card to see it.</p>
        )}
      </div>
    </main>
  )
}
