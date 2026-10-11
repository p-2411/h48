// One card: its content, where it came from, when it's due, its review history, and what can be
// done with it. Editing keeps the schedule; a change to what is tested becomes a new card.
// Shown with key={card.id}, so another card starts with a fresh view.
import { useState } from 'react'
import type { CardContent, CardDetail } from '../../../shared/cards'
import { languageName } from '../../../shared/languages'
import { CardForm } from '../components/CardForm'
import { cardReady, contentOf } from '../components/cards'
import { clock, when } from '../components/time'
import { stateLabel } from './labels'

export function CardView({
  card,
  onDeleted
}: {
  card: CardDetail
  onDeleted: (id: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState<CardContent>()
  const [error, setError] = useState<string>()

  const run = async (work: () => Promise<unknown>): Promise<void> => {
    setError(undefined)
    try {
      await work()
      setEditing(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.')
    }
  }
  const video = card.source.kind === 'video' ? card.source.moment : undefined

  if (editing)
    return (
      <section className="detail">
        <CardForm value={editing} onChange={setEditing} lang={card.language}>
          <p className="faint">
            Save keeps the review schedule. If you changed what the card tests, save it as a new
            card instead.
          </p>
          {error && <p className="notice error">{error}</p>}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={!cardReady(editing)}
              onClick={() => run(() => window.duet.cards.update(card.id, editing))}
            >
              Save
            </button>
            <button
              type="button"
              className="btn"
              disabled={!cardReady(editing)}
              onClick={() => run(() => window.duet.cards.saveAsNew(card.id, editing))}
            >
              Save as new card
            </button>
            <button type="button" className="btn quiet" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
          </div>
        </CardForm>
      </section>
    )

  return (
    <section className="detail">
      <div className="card-box">
        <p className="faint">
          {card.type === 'understand' ? 'Understand' : 'Use it'} · {languageName(card.language)} ·{' '}
          {stateLabel(card)}
        </p>
        <p className="big" lang={card.language}>
          {card.expression}
        </p>
        {card.reading && (
          <p className="muted" lang={card.language}>
            {card.reading}
          </p>
        )}
        <p>{card.meaning}</p>
      </div>
      <dl className="facts">
        <dt>What it tests</dt>
        <dd>{card.target}</dd>
        {card.situation && (
          <>
            <dt>Situation</dt>
            <dd>{card.situation}</dd>
          </>
        )}
        {card.alternative && (
          <>
            <dt>Alternative</dt>
            <dd>{card.alternative}</dd>
          </>
        )}
        {card.note && (
          <>
            <dt>Note</dt>
            <dd>{card.note}</dd>
          </>
        )}
        <dt>Source</dt>
        <dd>
          {video ? (
            <>
              <span lang={card.language}>{video.line.original}</span>
              {video.video.position !== undefined && (
                <span className="faint">
                  {' '}
                  · {video.video.site} {clock(video.video.position)}
                </span>
              )}
            </>
          ) : (
            'The tutor (not from a video)'
          )}
        </dd>
        <dt>Saved</dt>
        <dd>{when(card.createdAt)}</dd>
        {card.state !== 'new' && (
          <>
            <dt>Next review</dt>
            <dd>{when(card.due)}</dd>
          </>
        )}
      </dl>
      {card.explanation && (
        <section className="nuance-box" aria-label="Saved nuance analysis">
          <span className="label">Nuance analysis</span>
          <p>{card.explanation.meaning}</p>
          {card.explanation.notice && (
            <p>
              <strong>Notice:</strong> {card.explanation.notice.text}
            </p>
          )}
          {card.explanation.why && (
            <p>
              <strong>Why:</strong> {card.explanation.why}
            </p>
          )}
          {card.explanation.alternative && (
            <p>
              <strong>Alternative:</strong> {card.explanation.alternative.expression} —{' '}
              {card.explanation.alternative.changes}
            </p>
          )}
          {card.explanation.limitation && <p className="faint">{card.explanation.limitation}</p>}
        </section>
      )}
      {video && video.earlier.length > 0 && (
        <details>
          <summary>Original context ({video.earlier.length} lines before)</summary>
          {video.earlier.map((line, index) => (
            <p key={index}>
              <span lang={card.language}>{line.original}</span>
              {line.translation && <span className="muted"> {line.translation}</span>}
            </p>
          ))}
        </details>
      )}
      {card.reviews.length > 0 && (
        <details>
          <summary>
            Review history ({card.reviews.filter((review) => !review.undone).length})
          </summary>
          {card.reviews.map((review) => (
            <p key={review.id} className={review.undone ? 'faint' : undefined}>
              {when(review.reviewedAt)} · {review.rating}
              {review.undone ? ' (undone)' : ` · next ${when(review.dueAfter)}`}
            </p>
          ))}
        </details>
      )}
      {error && <p className="notice error">{error}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={() => setEditing(contentOf(card))}>
          Edit
        </button>
        {video && (
          <>
            <button type="button" className="btn" onClick={() => window.duet.cards.replay(card.id)}>
              Replay source
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.duet.cards.practise(card.id)}
            >
              Practise with tutor
            </button>
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => run(() => window.duet.cards.setPaused(card.id, !card.paused))}
        >
          {card.paused ? 'Resume reviews' : 'Pause reviews'}
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            run(async () => {
              await window.duet.cards.remove(card.id)
              onDeleted(card.id)
            })
          }
        >
          Delete
        </button>
      </div>
    </section>
  )
}
