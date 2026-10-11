// The explanation of one line: what it means here and the one thing worth noticing, with Replay
// and Save card. One component with no window of its own, so it can move into the tutor's window.
import type { ExplainState } from '../../../shared/explain'
import { LANGUAGES } from '../../../shared/types'
import { clock } from '../components/time'
import { Words } from '../components/Words'
import { SaveCard } from './SaveCard'

export function ExplainView({
  state,
  onReplay,
  onRetry
}: {
  state: ExplainState
  onReplay: () => void
  onRetry: () => void
}): React.JSX.Element {
  const { moment, explanation, loading, error } = state
  if (!moment) return <p className="muted center">Press Explain in the overlay while a line is on screen.</p>
  const processed = moment.line.processed
  const position = moment.video.position
  return (
    <div className="explain">
      <section className="card-box" aria-label="The line">
        <p className="line" lang={moment.language}>
          {processed ? <Words tokens={processed.source} /> : moment.line.original}
        </p>
        {processed && <p className="muted">{processed.translation}</p>}
        <p className="faint">
          {LANGUAGES[moment.language]}
          {position !== undefined && ` · ${clock(position)}`}
        </p>
      </section>

      {loading && <p className="muted">Explaining…</p>}
      {error && (
        <div className="notice error row">
          <span>{error}</span>
          <button type="button" className="btn quiet" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {explanation && (
        <>
          <section className="part">
            <h2 className="label">Meaning here</h2>
            <p>{explanation.meaning}</p>
          </section>
          {explanation.notice && (
            <section className="part">
              <h2 className="label">What to notice</h2>
              {explanation.notice.quote && (
                <p className="quote" lang={moment.language}>
                  {explanation.notice.quote}
                </p>
              )}
              <p>{explanation.notice.text}</p>
            </section>
          )}
          {explanation.why && (
            <section className="part">
              <h2 className="label">Why here</h2>
              <p>{explanation.why}</p>
            </section>
          )}
          {explanation.alternative && (
            <section className="part">
              <h2 className="label">Alternative</h2>
              <p className="quote" lang={moment.language}>
                {explanation.alternative.expression}
              </p>
              <p>{explanation.alternative.changes}</p>
            </section>
          )}
          {explanation.limitation && (
            <section className="part">
              <h2 className="label">Limitation</h2>
              <p className="muted">{explanation.limitation}</p>
            </section>
          )}
        </>
      )}

      {moment.earlier.length > 0 && (
        <details>
          <summary>Conversation context ({moment.earlier.length} lines before)</summary>
          {moment.earlier.map((line, index) => (
            <p key={index}>
              <span lang={moment.language}>{line.original}</span>
              {line.translation && <span className="muted"> {line.translation}</span>}
            </p>
          ))}
        </details>
      )}

      <div className="row">
        {position !== undefined && (
          <button type="button" className="btn" onClick={onReplay}>
            Replay
          </button>
        )}
        {explanation && <SaveCard key={moment.takenAt} moment={moment} explanation={explanation} />}
      </div>
      {explanation && <p className="faint">Written by AI ({explanation.model}). It can be wrong.</p>}
    </div>
  )
}
