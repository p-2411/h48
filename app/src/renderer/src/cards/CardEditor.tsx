// Editing a saved card. Save keeps its review schedule; Save as new card starts a new card (for a
// change to what it tests). The caller runs the save and shows its error.
import { useState } from 'react'
import type { CardContent, CardDetail } from '../../../shared/cards'
import { CardForm } from './CardForm'
import { cardReady, contentOf } from './content'

export function CardEditor({
  card,
  busy,
  error,
  onSave,
  onSaveAsNew,
  onCancel
}: {
  card: CardDetail
  busy: boolean
  error?: string
  onSave: (content: CardContent) => void
  onSaveAsNew: (content: CardContent) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(() => contentOf(card))
  return (
    <section className="detail">
      <CardForm value={value} onChange={setValue} lang={card.language}>
        <p className="faint">
          Save keeps the review schedule. If you changed what the card tests, save it as a new card
          instead.
        </p>
        {error && <p className="notice error">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !cardReady(value)}
            onClick={() => onSave(value)}
          >
            Save
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !cardReady(value)}
            onClick={() => onSaveAsNew(value)}
          >
            Save as new card
          </button>
          <button type="button" className="btn quiet" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </CardForm>
    </section>
  )
}
