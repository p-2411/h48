// Review, before a session: the cards waiting today in one line with Start, the words up today, the
// ladder as one bar (a step opens Words on it), and a quiet Make a card.
import { STEP_LABELS, STEPS, type Step, type TodayView } from '../../../../shared/flashcards'

export function Today({
  today,
  flash,
  onStart,
  onStep,
  onMake
}: {
  today?: TodayView
  /** A word just kept with Make a card. */
  flash?: string
  onStart: () => void
  onStep: (step: Step) => void
  onMake: () => void
}): React.JSX.Element {
  if (!today) return <div className="fc-today" />
  const words = STEPS.reduce((sum, step) => sum + today.ladder[step], 0)
  const more = today.total - today.upToday.length
  return (
    <div className="fc-today">
      {flash && (
        <span className="fc-flash" role="status">
          <b>{flash}</b> is kept. It joins your next review.
        </span>
      )}
      <div className="fc-today-row" data-tour="today">
        <div className="count">
          <b>
            {today.total === 0
              ? 'Nothing to review'
              : `${today.total} ${today.total === 1 ? 'card' : 'cards'} today`}
          </b>
          {today.total > 0 ? (
            <p className="fc-mix">
              <span>
                <b>{today.counts.new}</b> new
              </span>
              <span>
                <b>{today.counts.learning}</b> learning
              </span>
              <span>
                <b>{today.counts.review}</b> to review
              </span>
            </p>
          ) : (
            <p className="fc-empty">Keep words while you watch, and they come here to review.</p>
          )}
        </div>
        <button type="button" className="start" disabled={today.total === 0} onClick={onStart}>
          Start
        </button>
      </div>
      {today.upToday.length > 0 && (
        <div className="fc-up">
          <span className="fc-label">Up today</span>
          <p className="fc-chips" style={{ marginTop: 8 }}>
            {today.upToday.map((item) => (
              <span key={item.word} data-step={item.step}>
                {item.word}
              </span>
            ))}
            {more > 0 && <span className="more">and {more} more</span>}
          </p>
        </div>
      )}
      {words > 0 && (
        <div className="fc-ladder" data-tour="ladder">
          <div className="fc-ladder-head">
            <span className="fc-label">Your ladder</span>
            <span>{words} words</span>
          </div>
          <div className="fc-ladder-bar" aria-hidden="true">
            {STEPS.filter((step) => today.ladder[step] > 0).map((step) => (
              <span key={step} data-step={step} style={{ flexGrow: today.ladder[step] }} />
            ))}
          </div>
          <div className="fc-ladder-counts">
            {STEPS.map((step) => (
              <button
                type="button"
                key={step}
                data-step={step}
                aria-label={`${today.ladder[step]} words: ${STEP_LABELS[step]}`}
                onClick={() => onStep(step)}
              >
                <b>{today.ladder[step]}</b>
                <span>{STEP_LABELS[step]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="fc-today-foot">
        <button type="button" className="quiet" style={{ paddingLeft: 0 }} onClick={onMake}>
          Make a card
        </button>
      </div>
    </div>
  )
}
