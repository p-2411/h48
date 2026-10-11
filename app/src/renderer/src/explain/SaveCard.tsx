// Save card: an editable preview filled from the explanation, then Saved with a short-lived Undo.
// Saving the same card twice finds the first instead, unless the learner asks for another.
// Shown with a key per moment, so another line starts over.
import { useEffect, useState } from 'react'
import type { Card, CardContent } from '../../../shared/cards'
import type { Explanation } from '../../../shared/explain'
import type { Moment } from '../../../shared/moment'
import { CardForm } from '../components/CardForm'
import { cardReady } from '../components/cards'

const UNDO_MS = 8000

function draftOf(explanation: Explanation): CardContent {
  const { card, alternative } = explanation
  return {
    type: 'understand',
    expression: card.expression,
    meaning: card.meaning,
    target: card.target,
    situation: card.situation,
    alternative: alternative ? `${alternative.expression} — ${alternative.changes}` : undefined
  }
}

type Step = { name: 'closed' } | { name: 'editing' } | { name: 'saved'; card: Card; undo: boolean } | { name: 'duplicate'; card: Card }

export function SaveCard({ moment, explanation }: { moment: Moment; explanation: Explanation }): React.JSX.Element {
  const [step, setStep] = useState<Step>({ name: 'closed' })
  const [content, setContent] = useState(() => draftOf(explanation))
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (step.name !== 'saved' || !step.undo) return
    const timer = setTimeout(() => setStep({ ...step, undo: false }), UNDO_MS)
    return () => clearTimeout(timer)
  }, [step])

  const save = async (again = false): Promise<void> => {
    setError(undefined)
    try {
      const result = await window.duet.cards.save({ ...content, language: moment.language, source: { kind: 'video', moment }, explanation }, again)
      setStep('saved' in result ? { name: 'saved', card: result.saved, undo: true } : { name: 'duplicate', card: result.duplicate })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the card.')
    }
  }

  if (step.name === 'closed')
    return (
      <button type="button" className="btn" onClick={() => setStep({ name: 'editing' })}>
        Save card
      </button>
    )
  if (step.name === 'saved')
    return (
      <div className="notice row">
        <span>Saved.</span>
        <button type="button" className="btn quiet" onClick={() => window.duet.cards.open(step.card.id)}>
          Open card
        </button>
        {step.undo && (
          <button
            type="button"
            className="btn quiet"
            onClick={async () => {
              await window.duet.cards.remove(step.card.id)
              setStep({ name: 'editing' })
            }}
          >
            Undo
          </button>
        )}
      </div>
    )
  if (step.name === 'duplicate')
    return (
      <div className="notice row">
        <span>You already saved this card.</span>
        <button type="button" className="btn quiet" onClick={() => window.duet.cards.open(step.card.id)}>
          Open it
        </button>
        <button type="button" className="btn quiet" onClick={() => save(true)}>
          Save another
        </button>
      </div>
    )
  return (
    <section className="card-box" aria-label="Save card">
      <span className="label">Save card</span>
      <CardForm value={content} onChange={setContent} lang={moment.language}>
        {error && <p className="notice error">{error}</p>}
        <div className="row">
          <button type="button" className="btn primary" disabled={!cardReady(content)} onClick={() => save()}>
            Save
          </button>
          <button type="button" className="btn quiet" onClick={() => setStep({ name: 'closed' })}>
            Cancel
          </button>
        </div>
      </CardForm>
    </section>
  )
}
