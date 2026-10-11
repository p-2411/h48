// Cards in the conversation: a preview Duet prepared, waiting for the learner's click or answer (save
// it, or rate a review), and a card Duet opened.
import type { Language } from '../../../shared/languages'
import { RATINGS } from '../../../shared/cards'
import type { PendingTutorAction, ReviewRating, TutorCard } from '../../../shared/tutor'
import { clock } from '../components/time'

/** A save or review preview. Its buttons are disabled while a confirm is out (`busy`). */
export function CardPreview({
  pending,
  language,
  voiceOn,
  busy,
  onConfirm
}: {
  pending: PendingTutorAction
  language: Language
  voiceOn: boolean
  busy: boolean
  onConfirm: (rating?: ReviewRating) => void
}): React.JSX.Element {
  if (pending.kind === 'save-card')
    return (
      <section className="action-card" aria-label="Save this card?">
        <span className="label">Save this card?</span>
        <p className="big-line" lang={language}>
          {pending.draft.expression}
        </p>
        <p>{pending.draft.meaning}</p>
        <p className="muted">Remember: {pending.draft.target}</p>
        <div className="row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => onConfirm()}>
            {busy ? 'Saving…' : 'Save card'}
          </button>
          <span className="faint">{voiceOn ? 'Or say yes.' : 'Or reply yes.'}</span>
        </div>
      </section>
    )
  return (
    <section className="action-card" aria-label="How well did you remember it?">
      <span className="label">How well did you remember it?</span>
      <p className="big-line" lang={pending.card.language}>
        {pending.card.expression}
      </p>
      <div className="ratings">
        {RATINGS.map((rating) => (
          <button type="button" key={rating} className="rate" disabled={busy} onClick={() => onConfirm(rating)}>
            <b>{rating}</b>
            <span className="faint">{pending.previews.find((item) => item.rating === rating)?.intervalLabel}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** A card Duet opened or just saved. */
export function OpenedCard({ card, onClose }: { card: TutorCard; onClose: () => void }): React.JSX.Element {
  const moment = card.source.kind === 'video' ? card.source.moment : undefined
  return (
    <section className="action-card" aria-label="A saved card">
      <div className="row">
        <span className="label">Your card</span>
        <span className="spacer" />
        <button type="button" className="btn quiet" aria-label="Close the card" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="big-line" lang={card.language}>
        {card.expression}
      </p>
      <p>{card.meaning}</p>
      <p className="muted">Remember: {card.target}</p>
      <p className="faint">
        {moment ? `Saved from a video${moment.video.position !== undefined ? ` at ${clock(moment.video.position)}` : ''} · ` : 'Made with Duet · '}
        next review {new Date(card.due).toLocaleDateString()}
      </p>
      <button type="button" className="btn quiet" onClick={() => window.duet.cards.open(card.id)}>
        Open in My cards
      </button>
    </section>
  )
}
