// Review: the next due card, recall first, then reveal and rate. Ratings and what they mean are
// always shown; the interval on each button comes from the scheduler and is exactly what saving
// that rating will do.
import { useEffect, useRef, useState } from 'react'
import { RATING_LABELS, RATINGS, type Card, type Rating } from '../../../shared/cards'
import { wordKey, type WordState } from '../../../shared/knowledge'
import { say } from '../components/errors'
import { clock, when } from '../components/time'
import { ReviewSettings } from './ReviewSettings'
import { useReviewSession } from './useReviewSession'

// What each rating means, beside its button.
const MEANINGS: Record<Rating, string> = {
  again: 'I did not recall it correctly',
  hard: 'I recalled it, with real difficulty',
  good: 'I recalled it with ordinary effort',
  easy: 'I recalled it with very little effort'
}
const RATING_ROWS = RATINGS.map((rating) => ({ rating, label: RATING_LABELS[rating], meaning: MEANINGS[rating] }))

/** Takes back the last rating (shown while there is one to take back). */
function UndoRating({ busy, onUndo }: { busy: boolean; onUndo: () => void }): React.JSX.Element {
  return (
    <button type="button" className="btn quiet" disabled={busy} onClick={onUndo}>
      Undo last rating
    </button>
  )
}

/** The rung of the word a card is for, on the knowledge ladder: its glow's colour. */
function useCardRung(card: Card): WordState | undefined {
  const key = card.wordKey ?? wordKey(card.language, card.expression)
  const [rung, setRung] = useState<{ key: string; state: WordState }>()
  useEffect(() => {
    let current = true
    window.duet.knowledge.states(card.language, [key]).then(
      (states) => current && states[key] && setRung({ key, state: states[key] }),
      () => undefined
    )
    return () => {
      current = false
    }
  }, [card.language, key])
  return rung?.key === key ? rung.state : undefined
}

/** The card on its stage: what it asks, large, the word glowing in its rung's colour; its answer
 * blurred under it until shown, so the learner guesses first; once shown, what the card tests and
 * where it came from. */
function CardStage({
  card,
  label,
  revealed,
  onReplay
}: {
  card: Card
  label: string
  revealed: boolean
  onReplay: () => void
}): React.JSX.Element {
  const rung = useCardRung(card)
  const use = card.type === 'use'
  return (
    <div className="card-stage">
      <span className="label">{label}</span>
      {use && card.situation && <p className="muted">{card.situation}</p>}
      <p className="stage-front" lang={use ? undefined : card.language}>
        <span className="w" data-k={use ? undefined : rung}>
          {use ? card.meaning : card.expression}
        </span>
      </p>
      {!use && card.situation && <p className="muted">{card.situation}</p>}
      {/* The answer, blurred until shown; hidden from screen readers until then too. */}
      <p className={revealed ? 'stage-back' : 'stage-back is-hidden'} lang={use ? card.language : undefined} aria-hidden={!revealed}>
        {use ? (
          <span className="w" data-k={rung}>
            {card.expression}
          </span>
        ) : (
          card.meaning
        )}
      </p>
      {revealed && <Answer card={card} onReplay={onReplay} />}
    </div>
  )
}

/** What the card tests, and the rest of it, under the answer. */
function Answer({ card, onReplay }: { card: Card; onReplay: () => void }): React.JSX.Element {
  return (
    <div className="glass stage-answer">
      <p className="muted">What it tests: {card.target}</p>
      {card.explanation?.notice && <p>{card.explanation.notice.text}</p>}
      {card.alternative && <p className="muted">Alternative: {card.alternative}</p>}
      {card.note && <p className="muted">Note: {card.note}</p>}
      <Scene card={card} onReplay={onReplay} />
    </div>
  )
}

/** The scene the card came from: the line, with what the card tests lit up, and a way back to it. */
function Scene({ card, onReplay }: { card: Card; onReplay: () => void }): React.JSX.Element | null {
  if (card.source.kind !== 'video') return null
  const { line, video } = card.source.moment
  const at = line.original.toLocaleLowerCase().indexOf(card.expression.toLocaleLowerCase())
  return (
    <div className="scene">
      <p lang={card.language}>
        {at < 0 || card.expression === line.original ? (
          line.original
        ) : (
          <>
            {line.original.slice(0, at)}
            <mark>{line.original.slice(at, at + card.expression.length)}</mark>
            {line.original.slice(at + card.expression.length)}
          </>
        )}
      </p>
      <p className="faint">
        {video.title ?? video.site}
        {video.position !== undefined && ` · ${clock(video.position)}`}
        <button
          type="button"
          className="btn quiet"
          onClick={onReplay}
        >
          Replay
        </button>
      </p>
    </div>
  )
}

/** Review, until the learner ends it (`onEnd`: back to Your words, or on with the daily session). In
 * the daily session, `limit` caps it: after that many ratings it moves on with `onEnd`; once nothing
 * is left, it shows Continue. */
export function Review({ onEnd, limit }: { onEnd: () => void; limit?: number }): React.JSX.Element {
  const session = useReviewSession()
  const { queue, revealed, busy, error, act, settings } = session
  const inSession = limit !== undefined
  // Ratings that went through, to stop at the daily session's cap (and to say which card this is).
  const [rated, setRated] = useState(0)
  const rate = async (card: Card, rating: Rating): Promise<void> => {
    let count = rated
    await act(async () => {
      const next = await window.duet.cards.rate(card.id, card.revision, rating)
      count = rated + 1
      setRated(count)
      return next
    })
    if (inSession && count >= limit) onEnd()
  }
  // The Show button goes away once pressed, so focus moves on to the first rating; once rated, the
  // ratings go, so it comes back to the next card's Show button.
  const [replayError, setReplayError] = useState<string>()
  const firstRating = useRef<HTMLButtonElement>(null)
  const revealButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (revealed) firstRating.current?.focus()
  }, [revealed])
  const cardId = queue?.next?.card.id
  const shownCard = useRef(cardId)
  useEffect(() => {
    if (cardId && shownCard.current && cardId !== shownCard.current) revealButton.current?.focus()
    shownCard.current = cardId
  }, [cardId])

  if (session.loadError)
    return (
      <div className="notice error row" role="alert">
        <span>{session.loadError}</span>
        <button type="button" className="btn quiet" onClick={session.start}>
          Try again
        </button>
        {/* In the daily session, the rest of it can go on without the cards. */}
        {inSession && (
          <button type="button" className="btn quiet" onClick={onEnd}>
            Skip the rest
          </button>
        )}
      </div>
    )
  if (!queue)
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    )
  const { counts, next } = queue
  // In the daily session: which card of how many (as many as the cap, or as are left).
  const total = inSession ? Math.min(limit, rated + counts.due + counts.newAvailable) : 0
  const asks = next?.card.type === 'use' ? 'how would you say it?' : 'do you know it?'
  return (
    <section className={inSession ? 'review in-session' : 'review'}>
      {!inSession && (
        <p className="counts">
          <span>
            <b>{counts.due}</b> due now
          </span>
          <span>
            <b>{counts.newAvailable}</b> new
          </span>
          <span className="faint">{counts.laterToday} later today</span>
        </p>
      )}
      {(error || replayError) && (
        <p className="notice error" role="alert">
          {error ?? replayError}
        </p>
      )}

      {next ? (
        <>
          <CardStage
            card={next.card}
            label={inSession ? `Card ${Math.min(rated + 1, total)} of ${total} · ${asks}` : asks.charAt(0).toUpperCase() + asks.slice(1)}
            revealed={revealed}
            onReplay={() => window.duet.cards.replay(next.card.id).catch((cause) => setReplayError(say(cause, 'Could not go back to that moment.')))}
          />
          {revealed ? (
            <>
              <div className="ratings">
                {RATING_ROWS.map(({ rating, label, meaning }, index) => (
                  <button
                    key={rating}
                    ref={index === 0 ? firstRating : undefined}
                    type="button"
                    className={`btn rate ${rating}`}
                    title={meaning}
                    disabled={busy}
                    onClick={() => void rate(next.card, rating)}
                  >
                    <span>{label}</span>
                    <span className="faint">{next.outcomes[rating].interval}</span>
                  </button>
                ))}
              </div>
              {!inSession && (
                <ul className="legend">
                  {RATING_ROWS.map(({ rating, label, meaning }) => (
                    <li key={rating}>
                      <b>{label}</b> {meaning}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="stage-show">
              <button ref={revealButton} type="button" className="btn primary" onClick={session.reveal}>
                {next.card.type === 'use' ? 'Show how to say it' : 'Show the English'}
              </button>
            </div>
          )}
          <div className="row stage-more">
            <button
              type="button"
              className="btn quiet"
              disabled={busy}
              onClick={() => act(() => window.duet.cards.skip(next.card.id))}
            >
              Skip
            </button>
            {queue.canUndo && <UndoRating busy={busy} onUndo={() => act(() => window.duet.cards.undo())} />}
            <button type="button" className="btn quiet" onClick={onEnd}>
              {inSession ? 'Skip the rest' : 'End session'}
            </button>
          </div>
        </>
      ) : (
        <div className="glass">
          {session.noCards ? (
            <p>No cards yet. Save a line from the strip or from Explain.</p>
          ) : (
            <>
              <p>Nothing to review right now.</p>
              {queue.nextDueAt && (
                <p className="muted">Next card is due {when(queue.nextDueAt)}.</p>
              )}
            </>
          )}
          <div className="row">
            {queue.canUndo && <UndoRating busy={busy} onUndo={() => act(() => window.duet.cards.undo())} />}
            {inSession ? (
              <button type="button" className="btn primary" onClick={onEnd}>
                Continue
              </button>
            ) : (
              <button type="button" className="btn" onClick={onEnd}>
                Back to your words
              </button>
            )}
          </div>
        </div>
      )}

      {settings && !inSession && (
        <ReviewSettings
          settings={settings}
          onChange={session.setSettings}
          onSave={session.saveSettings}
        />
      )}
    </section>
  )
}
