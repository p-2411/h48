// Your words: every word met in the language learnt, on its rung of the knowledge ladder, joined
// with the cards in one list (join.ts); the word picked opens on the right with its card or cards.
// Review runs here too (Review N at the top), and its end comes back to the list. Main can ask to
// show one card (a card's "Open in Your words"): its word is picked. Backup and export are under ⋯.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HomeToday } from '../../../../shared/home'
import { STATE_LABELS, type WordState } from '../../../../shared/knowledge'
import { BackupMenu, type Notice } from '../../cards/BackupMenu'
import { say } from '../../components/errors'
import { LoadState } from '../../components/LoadState'
import { useSettingsState } from '../../components/useSettings'
import { Review } from '../../review/Review'
import { useLoaded } from '../useLoaded'
import { filterWords, joinWords, type WordFilter } from './join'
import { WordDetail } from './WordDetail'
import { WordList } from './WordList'
import { useCardDetails, useWordsData } from './useWordsData'

// The rungs counted at the top.
const COUNTED: WordState[] = ['unknown', 'encountered', 'known', 'speakable', 'usable', 'ignored']
const UNDO_MS = 8000

const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()

/** A deleted card can be brought back for a few seconds (its Undo takes the focus: the card's own
 * buttons are gone). */
function useUndoDelete(
  onRestored: (id: string) => void,
  onFailed: (notice: Notice) => void
): {
  deleted: { id: string; expression: string }[]
  markDeleted: (id: string, expression: string) => void
  undo: (id: string) => Promise<void>
  lastUndo: React.RefObject<HTMLButtonElement | null>
} {
  const [deleted, setDeleted] = useState<{ id: string; expression: string }[]>([])
  const forget = (id: string): void => setDeleted((items) => items.filter((item) => item.id !== id))
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])
  const lastUndo = useRef<HTMLButtonElement>(null)
  const undoCount = useRef(0)
  useEffect(() => {
    if (deleted.length > undoCount.current) lastUndo.current?.focus()
    undoCount.current = deleted.length
  }, [deleted.length])
  return {
    deleted,
    lastUndo,
    markDeleted: (id, expression) => {
      setDeleted((items) => [...items, { id, expression }])
      timers.current.push(window.setTimeout(() => forget(id), UNDO_MS))
    },
    undo: async (id) => {
      try {
        await window.duet.cards.restore(id)
        onRestored(id)
        forget(id)
      } catch (failure) {
        onFailed({ text: say(failure, 'That card could not be brought back.'), error: true })
      }
    }
  }
}

/** `review` opens the page straight into Review; its end comes back to the list and calls
 * `onReviewEnd`. `onPractise` opens Talk about a word. */
export function YourWords({
  review,
  requestedCard,
  onReviewEnd,
  onPractise
}: {
  review?: boolean
  requestedCard?: { id: string }
  onReviewEnd?: () => void
  onPractise: (word: string) => void
}): React.JSX.Element {
  const { settings, error: settingsError, reload: reloadSettings } = useSettingsState()
  const language = settings?.language
  const words = useWordsData(language)
  // Settings that can't be read (so no language) say so, rather than leaving the page loading.
  const { data, error, reload } = settings
    ? words
    : { data: undefined, error: settingsError, reload: reloadSettings }
  const due = useLoaded(loadToday, 'Could not count the cards to review.').value?.due
  const [reviewing, setReviewing] = useState(false)
  const [filter, setFilter] = useState<WordFilter>({ show: 'all' })
  // The row picked, or the card main asked to show (its row is picked once it's in the list).
  const [picked, setPicked] = useState<{ key: string } | { card: string } | undefined>(
    requestedCard ? { card: requestedCard.id } : undefined
  )
  const [notice, setNotice] = useState<Notice>()
  const [actionError, setActionError] = useState<string>()
  const pickCard = (id: string): void => setPicked({ card: id })
  const undo = useUndoDelete(pickCard, setNotice)

  // Opened on one card (from Explain or the strip): show it, with no filters hiding it.
  useEffect(
    () =>
      window.duet.cards.onShow((id) => {
        setFilter({ show: 'all' })
        setReviewing(false)
        setPicked({ card: id })
      }),
    []
  )

  const [lastRequest, setLastRequest] = useState(requestedCard)
  if (requestedCard !== lastRequest) {
    setLastRequest(requestedCard)
    if (requestedCard) {
      setFilter({ show: 'all' })
      setReviewing(false)
      setPicked({ card: requestedCard.id })
    }
  }

  const rows = useMemo(
    () => (data ? joinWords(data.summary.words, data.cards, data.language, data.at) : []),
    [data]
  )
  const shown = useMemo(() => filterWords(rows, filter), [rows, filter])
  const selected = picked
    ? rows.find((row) =>
        'key' in picked ? row.key === picked.key : row.cards.some((card) => card.id === picked.card)
      )
    : shown[0]
  const details = useCardDetails(selected?.cards.map((card) => card.id) ?? [], data)

  const endReview = (): void => {
    setReviewing(false)
    onReviewEnd?.()
  }
  if (review || reviewing)
    return (
      <main className="home-page your-words is-reviewing">
        <h1>Review</h1>
        <Review onEnd={endReview} />
      </main>
    )

  const setIgnored = (key: string, ignored: boolean): void => {
    if (!language) return
    setActionError(undefined)
    window.duet.knowledge
      .setIgnored(language, key, ignored)
      .catch((cause) => setActionError(say(cause, 'Could not change that word.')))
  }
  const counts = data?.summary.counts
  const listed = data ? data.summary.words.length : 0
  const total = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0
  const empty = !!data && rows.length === 0
  return (
    <main className="home-page your-words">
      <header className="yw-head">
        <h1>Your words</h1>
        {counts && !empty && (
          <ul className="yw-counts" aria-label="On the ladder">
            {COUNTED.map((state) => (
              <li key={state}>
                <b className="w" data-k={state}>
                  {counts[state]}
                </b>
                <span>{STATE_LABELS[state]}</span>
              </li>
            ))}
          </ul>
        )}
        <span className="spacer" />
        {/* Until the count is known it just says Review. */}
        <button
          type="button"
          className="btn primary"
          disabled={due === 0}
          title={due === 0 ? 'Nothing to review right now' : undefined}
          onClick={() => setReviewing(true)}
        >
          {due ? `Review ${due}` : 'Review'}
        </button>
        <BackupMenu onNotice={setNotice} />
      </header>
      <LoadState loaded={!!data} error={error} reload={reload} />
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
      {actionError && (
        <p className="notice error" role="alert">
          {actionError}
        </p>
      )}
      {undo.deleted.map(({ id, expression }, index) => (
        <p key={id} className="notice row" role="status">
          <span>Deleted “{expression}”.</span>
          <button
            ref={index === undo.deleted.length - 1 ? undo.lastUndo : undefined}
            type="button"
            className="btn quiet"
            onClick={() => undo.undo(id)}
          >
            Undo
          </button>
        </p>
      ))}
      {empty && <p className="muted yw-first">Words you meet while watching land here.</p>}
      {data && counts && !empty && (
        <div className="yw-browse">
          <WordList
            rows={shown}
            language={data.language}
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            selected={selected?.key}
            onSelect={(key) => setPicked({ key })}
            more={total > listed ? `Showing the ${listed} words you met most recently.` : undefined}
          />
          {selected ? (
            <WordDetail
              row={selected}
              language={data.language}
              cards={details?.cards}
              cardsError={details?.error}
              onIgnore={(ignored) => setIgnored(selected.key, ignored)}
              onPractise={() => onPractise(selected.text)}
              onDeleted={(id, expression) => undo.markDeleted(id, expression)}
              onSavedAsNew={(id) => {
                pickCard(id)
                setNotice({ text: 'Saved as a new card.' })
              }}
            />
          ) : (
            <section className="glass yw-detail yw-pick">
              <p className="faint">Pick a word to see how well you know it.</p>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
