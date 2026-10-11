// What the card's line means here, as Explain said when the card was saved.
import type { CardDetail } from '../../../shared/cards'

export function NuanceBox({
  explanation
}: {
  explanation: NonNullable<CardDetail['explanation']>
}): React.JSX.Element {
  return (
    <section className="nuance-box" aria-label="Saved nuance analysis">
      <span className="label">Nuance analysis</span>
      <p>{explanation.meaning}</p>
      {explanation.notice && (
        <p>
          <strong>Notice:</strong> {explanation.notice.text}
        </p>
      )}
      {explanation.why && (
        <p>
          <strong>Why:</strong> {explanation.why}
        </p>
      )}
      {explanation.alternative && (
        <p>
          <strong>Alternative:</strong> {explanation.alternative.expression} —{' '}
          {explanation.alternative.changes}
        </p>
      )}
      {explanation.limitation && <p className="faint">{explanation.limitation}</p>}
    </section>
  )
}
