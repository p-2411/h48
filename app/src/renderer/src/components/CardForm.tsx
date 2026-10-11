// The fields of a card, for saving a new one or editing a saved one. The buttons are the caller's.
import type { CardContent } from '../../../shared/cards'

export function CardForm({
  value,
  onChange,
  lang,
  children
}: {
  value: CardContent
  onChange: (value: CardContent) => void
  lang: string
  children: React.ReactNode
}): React.JSX.Element {
  const set = (field: keyof CardContent) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [field]: event.target.value })
  return (
    <form className="form" onSubmit={(event) => event.preventDefault()}>
      <div className="row">
        <div className="segment" role="group" aria-label="Card type">
          <button type="button" aria-pressed={value.type === 'understand'} onClick={() => onChange({ ...value, type: 'understand' })}>
            Understand
          </button>
          <button type="button" aria-pressed={value.type === 'use'} onClick={() => onChange({ ...value, type: 'use' })}>
            Use it
          </button>
        </div>
        <span className="faint">
          {value.type === 'understand' ? 'See the expression, recall what it means.' : 'See the situation, recall what to say.'}
        </span>
      </div>
      <label className="field">
        <span>Expression</span>
        <input lang={lang} value={value.expression} onChange={set('expression')} />
      </label>
      <label className="field">
        <span>Reading (optional)</span>
        <input lang={lang} value={value.reading ?? ''} onChange={set('reading')} />
      </label>
      <label className="field">
        <span>Meaning</span>
        <textarea value={value.meaning} onChange={set('meaning')} />
      </label>
      <label className="field">
        <span>What it tests</span>
        <input value={value.target} onChange={set('target')} />
      </label>
      <label className="field">
        <span>Situation</span>
        <textarea value={value.situation ?? ''} onChange={set('situation')} />
      </label>
      <label className="field">
        <span>Alternative (optional)</span>
        <textarea value={value.alternative ?? ''} onChange={set('alternative')} />
      </label>
      <label className="field">
        <span>Note (optional)</span>
        <textarea value={value.note ?? ''} onChange={set('note')} />
      </label>
      {children}
    </form>
  )
}
