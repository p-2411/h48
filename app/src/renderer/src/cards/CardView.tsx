// One card: its content, where it came from, when it's due, its review history, and what can be
// done with it. Editing keeps the schedule; a change to what is tested becomes a new card.
// Shown with key={card.id}, so another card starts with a fresh view.
import { useEffect, useRef, useState } from 'react'
import { RATING_LABELS, type CardDetail } from '../../../shared/cards'
import { languageName } from '../../../shared/languages'
import { say } from '../components/errors'
import { clock, when } from '../components/time'
import { CardEditor } from './CardEditor'
import { stateLabel } from './labels'
import { NuanceBox } from './NuanceBox'

export function CardView({
  card,
  onDeleted,
  onSavedAsNew
}: {
  card: CardDetail
  /** The card was deleted (its expression, to say which). */
  onDeleted: (id: string, expression: string) => void
  /** An edit was saved as a new card: that card. */
  onSavedAsNew: (id: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  // A button turned off while it runs loses focus (Pause, say); once it is back on, it gets focus
  // back, unless focus has gone somewhere else meanwhile.
  const pressed = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (busy || !pressed.current) return
    if (pressed.current.isConnected && document.activeElement === document.body)
      pressed.current.focus()
    pressed.current = null
  }, [busy])
  // Leaving the editor (Cancel or a save) puts focus back on Edit, not at the top of the window.
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  // One action at a time: the buttons are off while it runs, so "Save as new card" pressed twice
  // still makes one card. The ref also stops a second press that comes before the buttons turn off.
  const running = useRef(false)
  const run = async (work: () => Promise<unknown>): Promise<void> => {
    if (running.current) return
    running.current = true
    pressed.current = document.activeElement as HTMLElement | null
    setBusy(true)
    setError(undefined)
    try {
      await work()
      setEditing(false)
    } catch (failure) {
      setError(say(failure, 'That did not work.'))
    } finally {
      running.current = false
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
        onSaveAsNew={(content) => run(async () => onSavedAsNew((await window.duet.cards.saveAsNew(card.id, content)).id))}
        onCancel={() => {
          setError(undefined)
          setEditing(false)
        }}
      />
    )

  return (
    <section className="detail">
      <div className="glass">
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
            'Made with Duet'
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
          <div className="history">
            {card.reviews.map((review) => (
              <p key={review.id} className={review.undone ? 'faint' : undefined}>
                {when(review.reviewedAt)} · {RATING_LABELS[review.rating]}
                {review.undone ? ' (undone)' : ` · next ${when(review.dueAfter)}`}
              </p>
            ))}
          </div>
        </details>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button
          ref={editButton}
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        {video && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => window.duet.cards.replay(card.id).catch((cause) => setError(say(cause, 'Could not go back to that moment.')))}
            >
              Replay
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.duet.cards.practise(card.id).catch((cause) => setError(say(cause, 'Could not open Explain on that line.')))}
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
              onDeleted(card.id, card.expression)
            })
          }
        >
          Delete
        </button>
      </div>
    </section>
  )
}
