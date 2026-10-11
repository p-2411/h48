// Review: the next due card, recall first, then reveal and rate. Ratings and what they mean are
// always shown; the interval on each button comes from the scheduler and is exactly what saving
// that rating will do.
import { useCallback, useEffect, useState } from 'react'
import type { Card, Rating, ReviewQueue, ReviewSettings } from '../../../shared/cards'
import { when } from '../components/time'

const RATINGS: { rating: Rating; label: string; meaning: string }[] = [
  { rating: 'again', label: 'Again', meaning: 'I did not recall it correctly' },
  { rating: 'hard', label: 'Hard', meaning: 'I recalled it, with real difficulty' },
  { rating: 'good', label: 'Good', meaning: 'I recalled it with ordinary effort' },
  { rating: 'easy', label: 'Easy', meaning: 'I recalled it with very little effort' }
]

function Prompt({ card }: { card: Card }): React.JSX.Element {
  if (card.type === 'use')
    return (
      <div className="card-box prompt">
        <span className="label">What would you say?</span>
        {card.situation && <p>{card.situation}</p>}
        <p className="big">{card.meaning}</p>
      </div>
    )
  return (
    <div className="card-box prompt">
      <span className="label">What does it mean here?</span>
      <p className="big" lang={card.language}>
        {card.expression}
      </p>
      {card.situation && <p className="muted">{card.situation}</p>}
    </div>
  )
}

function Answer({ card }: { card: Card }): React.JSX.Element {
  return (
    <div className="card-box">
      {card.type === 'use' ? (
        <p className="big" lang={card.language}>
          {card.expression}
        </p>
      ) : (
        <p className="big">{card.meaning}</p>
      )}
      <p className="muted">Tests: {card.target}</p>
      {card.explanation?.notice && <p>{card.explanation.notice.text}</p>}
      {card.alternative && <p className="muted">Alternative: {card.alternative}</p>}
      {card.note && <p className="muted">Note: {card.note}</p>}
    </div>
  )
}

export function Review({ onBrowse }: { onBrowse: () => void }): React.JSX.Element {
  const [queue, setQueue] = useState<ReviewQueue>()
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [settings, setSettings] = useState<ReviewSettings>()

  const act = useCallback(async (work: () => Promise<ReviewQueue>) => {
    setBusy(true)
    setError(undefined)
    try {
      setQueue(await work())
      setRevealed(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.')
      setQueue(await window.duet.cards.reviewQueue())
      setRevealed(false)
    } finally {
      setBusy(false)
    }
  }, [])

  // New settings apply from the next card shown, so the queue is loaded again.
  const saveSettings = (change: ReviewSettings): void => {
    window.duet.cards.setSettings(change).then((saved) => {
      setSettings(saved)
      void act(() => window.duet.cards.reviewQueue())
    })
  }

  useEffect(() => {
    window.duet.cards.startReview().then(setQueue)
    window.duet.cards.getSettings().then(setSettings)
  }, [])

  if (!queue) return <p className="muted">Loading…</p>
  const { counts, next } = queue
  return (
    <section className="review">
      <p className="counts">
        <span>
          <b>{counts.due}</b> due now
        </span>
        <span>
          <b>{counts.newAvailable}</b> new
        </span>
        <span className="faint">{counts.laterToday} later today</span>
      </p>
      {error && <p className="notice error">{error}</p>}

      {next ? (
        <>
          <Prompt card={next.card} />
          {revealed ? (
            <>
              <Answer card={next.card} />
              <div className="ratings">
                {RATINGS.map(({ rating, label, meaning }) => (
                  <button
                    key={rating}
                    type="button"
                    className={`btn rate ${rating}`}
                    title={meaning}
                    disabled={busy}
                    onClick={() => act(() => window.duet.cards.rate(next.card.id, next.card.revision, rating))}
                  >
                    <span>{label}</span>
                    <span className="faint">{next.outcomes[rating].interval}</span>
                  </button>
                ))}
              </div>
              <ul className="legend">
                {RATINGS.map(({ rating, label, meaning }) => (
                  <li key={rating}>
                    <b>{label}</b> {meaning}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="faint">Try to recall it first, silently or aloud.</p>
          )}
          <div className="row">
            {!revealed && (
              <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
                Reveal answer
              </button>
            )}
            <button type="button" className="btn quiet" disabled={busy} onClick={() => act(() => window.duet.cards.skip(next.card.id))}>
              Skip
            </button>
            {queue.canUndo && (
              <button type="button" className="btn quiet" disabled={busy} onClick={() => act(() => window.duet.cards.undo())}>
                Undo last rating
              </button>
            )}
            <button type="button" className="btn quiet" onClick={onBrowse}>
              End session
            </button>
          </div>
        </>
      ) : (
        <div className="card-box">
          <p>Nothing to review right now.</p>
          {queue.nextDueAt && <p className="muted">Next card is due {when(queue.nextDueAt)}.</p>}
          <div className="row">
            {queue.canUndo && (
              <button type="button" className="btn quiet" onClick={() => act(() => window.duet.cards.undo())}>
                Undo last rating
              </button>
            )}
            <button type="button" className="btn" onClick={onBrowse}>
              Browse cards
            </button>
          </div>
        </div>
      )}

      {settings && (
        <details className="settings">
          <summary>Review settings</summary>
          <label className="field">
            <span>Target recall: {Math.round(settings.desiredRetention * 100)}% (higher means more reviews)</span>
            <input
              type="range"
              min={0.8}
              max={0.97}
              step={0.01}
              value={settings.desiredRetention}
              onChange={(event) => setSettings({ ...settings, desiredRetention: Number(event.target.value) })}
              onMouseUp={() => saveSettings(settings)}
              onKeyUp={() => saveSettings(settings)}
            />
          </label>
          <label className="field">
            <span>New cards per day</span>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.newPerDay}
              onChange={(event) => setSettings({ ...settings, newPerDay: Number(event.target.value) })}
              onBlur={() => saveSettings(settings)}
            />
          </label>
          <p className="faint">Changes apply to the next ratings; cards already scheduled keep their dates.</p>
        </details>
      )}
    </section>
  )
}
