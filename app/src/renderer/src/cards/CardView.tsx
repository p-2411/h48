// One card: its content, where it came from, when it's due, its review history, and what can be
// done with it. Editing keeps the schedule; a change to what is tested becomes a new card.
// Shown with key={card.id}, so another card starts with a fresh view.
import { useState } from 'react'
import type { CardDetail } from '../../../shared/cards'
import { languageName } from '../../../shared/languages'
import { say } from '../components/errors'
import { clock, when } from '../components/time'
import { CardEditor } from './CardEditor'
import { stateLabel } from './labels'
import { NuanceBox } from './NuanceBox'

export function CardView({
  card,
  onDeleted
}: {
  card: CardDetail
  onDeleted: (id: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  // One action at a time: the buttons are off while it runs, so "Save as new card" pressed twice
  // still makes one card.
  const run = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await work()
      setEditing(false)
    } catch (failure) {
      setError(say(failure, 'That did not work.'))
    } finally {
      setBusy(false)
    }
  }
  const video = card.source.kind === 'video' ? card.source.moment : undefined

  if (editing)
    return (
      <CardEditor
        card={card}
        busy={busy}
        error={error}
        onSave={(content) => run(() => window.duet.cards.update(card.id, content))}
        onSaveAsNew={(content) => run(() => window.duet.cards.saveAsNew(card.id, content))}
        onCancel={() => {
          setError(undefined)
          setEditing(false)
        }}
      />
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
      {card.explanation && <NuanceBox explanation={card.explanation} />}
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
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
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
              Practise in Explain
            </button>
          </>
        )}
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => run(() => window.duet.cards.setPaused(card.id, !card.paused))}
        >
          {card.paused ? 'Resume reviews' : 'Pause reviews'}
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
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
