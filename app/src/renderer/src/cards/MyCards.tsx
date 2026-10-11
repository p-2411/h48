// My cards: every saved card, to browse, edit, pause and delete, plus backup and export (in the ⋯
// menu). A place in the home base; its Review button opens Review there.
import { useState } from 'react'
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
  const [deleted, setDeleted] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice>()

  // Each deleted card can be brought back for a few seconds.
  const forget = (id: string): void => setDeleted((ids) => ids.filter((item) => item !== id))
  const markDeleted = (id: string): void => {
    setDeleted((ids) => [...ids, id])
    setTimeout(() => forget(id), UNDO_MS)
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
      {deleted.map((id) => (
        <p key={id} className="notice row">
          <span>Card deleted.</span>
          <button type="button" className="btn quiet" onClick={() => undoDelete(id)}>
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
