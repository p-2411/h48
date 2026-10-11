// The explanation of one line. It opens with the line itself (the words worth noticing lit up in
// it), Replay, Converse (the voice tutor on this line) and Save card, then one short paragraph:
// what it means here and how it comes across.
// The reasoning, an alternative and any doubt fold under "More"; the conversation about the line
// follows. One component with no window of its own, so it can move into the tutor's window.
import type { ExplainState, HearingNote } from '../../../shared/explain'
import { languageName } from '../../../shared/languages'
import { clock } from '../components/time'
import { Chat } from './Chat'
import { SaveCard } from './SaveCard'

// Why the explanation could not draw on the audio, when it couldn't.
const HEARING: Partial<Record<HearingNote, string>> = {
  asking:
    'Allow System Audio Recording when macOS asks, and Duet will hear how the next lines are said.',
  'not-allowed':
    'Duet can’t hear the video. Allow it in System Settings › Privacy & Security › Screen & System Audio Recording.',
  'not-kept':
    'This line played too long ago for Duet to hear it, so the explanation goes by the words.',
  unclear: 'Duet couldn’t make out the speech in this line, so the explanation goes by the words.'
}

/** The line, with the quoted words lit up when they are in it. */
function LineWithQuote({ text, quote }: { text: string; quote?: string }): React.JSX.Element {
  const at = quote ? text.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase()) : -1
  if (!quote || at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + quote.length)}</mark>
      {text.slice(at + quote.length)}
    </>
  )
}

export function ExplainView({
  state,
  onReplay,
  onRetry
}: {
  state: ExplainState
  onReplay: () => void
  onRetry: () => void
}): React.JSX.Element {
  const { moment, explanation, loading, stage, hearing, error } = state
  if (!moment) return <p className="muted center">Press Explain on the strip, or on a line in Script.</p>
  const processed = moment.line.processed
  const position = moment.video.position
  const more = explanation && (explanation.why || explanation.alternative || explanation.limitation || moment.earlier.length > 0)
  return (
    <div className="explain">
      <section className="card-box" aria-label="The line">
        <p className="line" lang={moment.language}>
          <LineWithQuote text={moment.line.original} quote={explanation?.notice?.quote} />
        </p>
        {processed && <p className="muted">{processed.translation}</p>}
        <div className="row">
          <span className="faint">
            {moment.video.title ?? languageName(moment.language)}
            {position !== undefined && ` · ${clock(position)}`}
          </span>
          <span className="spacer" />
          {position !== undefined && (
            <button type="button" className="btn quiet" onClick={onReplay}>
              ↺ Replay
            </button>
          )}
          <button type="button" className="btn quiet" onClick={() => window.duet.explain.converse()}>
            Converse
          </button>
          {explanation && <SaveCard key={moment.takenAt} moment={moment} explanation={explanation} />}
        </div>
      </section>

      {loading && <p className="muted">{stage === 'listening' ? 'Listening…' : 'Explaining…'}</p>}
      {error && (
        <div className="notice error row">
          <span>{error}</span>
          <button type="button" className="btn quiet" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {explanation && (
        <section className="part">
          <p className="lead">
            {explanation.meaning}
            {explanation.heard && (
              <span className="heard" title={`Includes how it was said, from the audio (spoken in ${explanation.heard.spokenLanguage})`}>
                heard
              </span>
            )}
          </p>
          {explanation.notice && <p>{explanation.notice.text}</p>}
          {hearing && HEARING[hearing] && <p className="faint">{HEARING[hearing]}</p>}
        </section>
      )}

      {more && (
        <details className="more-explain">
          <summary>More</summary>
          {explanation.why && (
            <section className="part">
              <h2 className="label">Why here</h2>
              <p>{explanation.why}</p>
            </section>
          )}
          {explanation.alternative && (
            <section className="part">
              <h2 className="label">Another way to say it</h2>
              <p className="quote" lang={moment.language}>
                {explanation.alternative.expression}
              </p>
              <p>{explanation.alternative.changes}</p>
            </section>
          )}
          {explanation.limitation && (
            <section className="part">
              <h2 className="label">Not sure about</h2>
              <p className="muted">{explanation.limitation}</p>
            </section>
          )}
          {moment.earlier.length > 0 && (
            <section className="part">
              <h2 className="label">Lines before</h2>
              {moment.earlier.map((line, index) => (
                <p key={index}>
                  <span lang={moment.language}>{line.original}</span>
                  {line.translation && <span className="muted"> {line.translation}</span>}
                </p>
              ))}
            </section>
          )}
        </details>
      )}

      {explanation && <p className="faint">Written by AI ({explanation.model}). It can be wrong.</p>}
      {explanation && <Chat chat={state.chat} replying={state.replying} error={state.chatError} lang={moment.language} />}
    </div>
  )
}
