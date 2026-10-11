// Save: one click saves the card Duet wrote from the explanation; nothing to fill in. It can be
// edited later in My cards. Saved shows a short-lived Undo; the same card saved twice is found
// instead of saved again. Shown with a key per moment, so another line starts over.
import { useEffect, useState } from 'react'
import type { Card, CardDraft } from '../../../shared/cards'
import type { Explanation } from '../../../shared/explain'
import type { Moment } from '../../../shared/moment'
import { say } from '../components/errors'
import { exclusive } from '../components/exclusive'

const UNDO_MS = 8000

function draftOf(moment: Moment, explanation: Explanation): CardDraft {
  const { card, alternative } = explanation
  return {
    type: 'understand',
    expression: card.expression,
    meaning: card.meaning,
    target: card.target,
    situation: card.situation || undefined,
    alternative: alternative ? `${alternative.expression} — ${alternative.changes}` : undefined,
    language: moment.language,
    source: { kind: 'video', moment },
    explanation
  }
}

type Step =
  | { name: 'ready' }
  | { name: 'saving' }
  | { name: 'saved'; card: Card; undo: boolean }
  | { name: 'duplicate'; card: Card }

export function SaveCard({
  moment,
  explanation
}: {
  moment: Moment
  explanation: Explanation
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ name: 'ready' })
  const [error, setError] = useState<string>()
  const [undoing, setUndoing] = useState(false)
  // Undo takes the card back once, however often it's pressed.
  const [runUndo] = useState(() => exclusive(setUndoing))

  useEffect(() => {
    if (step.name !== 'saved' || !step.undo) return
    const timer = setTimeout(() => setStep({ ...step, undo: false }), UNDO_MS)
    return () => clearTimeout(timer)
  }, [step])

  const save = async (): Promise<void> => {
    setStep({ name: 'saving' })
    setError(undefined)
    try {
      const result = await window.duet.cards.save(draftOf(moment, explanation))
      setStep(
        'saved' in result
          ? { name: 'saved', card: result.saved, undo: true }
          : { name: 'duplicate', card: result.duplicate }
      )
    } catch (failure) {
      setError(say(failure, 'Could not save the card.'))
      setStep({ name: 'ready' })
    }
  }

  if (step.name === 'saved' || step.name === 'duplicate')
    return (
      <span className="row">
        <span className="muted">{step.name === 'saved' ? 'Saved' : 'Already saved'}</span>
        <button
          type="button"
          className="btn quiet"
          onClick={() => window.duet.cards.open(step.card.id)}
        >
          Open in My cards
        </button>
        {step.name === 'saved' && step.undo && (
          <button
            type="button"
            className="btn quiet"
            disabled={undoing}
            onClick={() =>
              void runUndo(async () => {
                try {
                  await window.duet.cards.remove(step.card.id)
                  setStep({ name: 'ready' })
                } catch (failure) {
                  setError(say(failure, 'Could not take the card back. Remove it in My cards.'))
                }
              })
            }
          >
            Undo
          </button>
        )}
      </span>
    )
  return (
    <>
      <button type="button" className="btn" disabled={step.name === 'saving'} onClick={save}>
        Save
      </button>
      {error && (
        <span className="notice error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
