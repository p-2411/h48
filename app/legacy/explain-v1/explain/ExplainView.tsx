// The explanation of one line, and the conversation about it, on the surface Talk uses too
// (ChatSurface.tsx). On top, the line's card: the line (the words worth noticing glowing in their
// rung's colour), its English, where it came from, Replay and Save. Then the explanation, as Duet's
// first message: what it means here and how it comes across, with the reasoning, an alternative and
// any doubt folded under "More" inside it. The conversation with Duet follows, in text or voice
// (Conversation.tsx), above the suggestions and the message bar.
import { motion } from 'motion/react'
import type { ExplainState, HearingNote } from '../../../shared/explain'
import { wordKey } from '../../../shared/knowledge'
import { languageName } from '../../../shared/languages'
import { clock } from '../components/time'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { DURATION, fade } from '../components/motion'
import { useRung } from '../components/useRung'
import type { Language } from '../../../shared/languages'
import { ChatSurface, DuetBubble } from './ChatSurface'
import { Conversation } from './Conversation'
import { SaveCard } from './SaveCard'
import { Icon } from '../components/Icon'

// Why the explanation could not draw on the audio, when it couldn't (while macOS is still asking for
// the permission, nothing is said: macOS's own prompt says it).
const HEARING: Partial<Record<HearingNote, string>> = {
  'not-allowed':
    'Duet can’t hear the video. Allow it in System Settings › Privacy & Security › Screen & System Audio Recording.',
  'not-kept':
    'This line played too long ago for Duet to hear it, so the explanation goes by the words.',
  unclear: 'Duet couldn’t make out the speech in this line, so the explanation goes by the words.'
}

/** The line, with the quoted words glowing in their rung's colour when they are in it. */
function LineWithQuote({ text, quote, language }: { text: string; quote?: string; language: Language }): React.JSX.Element {
  const rung = useRung(language, quote ? wordKey(language, quote) : undefined)
  const at = quote ? text.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase()) : -1
  if (!quote || at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="w quote-word" data-k={rung}>
        {text.slice(at, at + quote.length)}
      </span>
      {text.slice(at + quote.length)}
    </>
  )
}

export function ExplainView({
  state,
  onReplay,
  onRetry,
  mascotSlot
}: {
  state: ExplainState
  onReplay: () => void
  onRetry: () => void
  /** The panel's top bar, where the conversation's mascot goes. */
  mascotSlot: HTMLElement | null
}): React.JSX.Element {
  const { moment, explanation, loading, stage, hearing, error, retryable } = state
  if (!moment)
    return error ? (
      <p className="notice error" role="alert">
        {error}
      </p>
    ) : (
      <p className="muted center">Press Explain on the strip, or on a line in Script.</p>
    )
  const processed = moment.line.processed
  const position = moment.video.position
  const more =
    explanation &&
    (explanation.why ||
      explanation.alternative ||
      explanation.limitation ||
      moment.earlier.length > 0)
  return (
    <motion.div className="explain-tab" {...fade(DURATION.fast)}>
      <ChatSurface
        top={
          <>
            <section className="glass line-card" aria-label="The line">
              <p className="line" lang={moment.language}>
                <LineWithQuote text={moment.line.original} quote={explanation?.notice?.quote} language={moment.language} />
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
                    <Icon name="replay" size={14} />
                    Replay
                  </button>
                )}
                {explanation && <SaveCard key={moment.takenAt} moment={moment} explanation={explanation} />}
              </div>
            </section>

            {/* Duet at work: a message with dots, as it listens, then explains. */}
            {loading && (
              <DuetBubble label="Duet is explaining">
                <p className="typing">
                  {stage === 'listening' ? 'Listening' : 'Explaining'}
                  <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </p>
              </DuetBubble>
            )}
            {error && (
              <div className="notice error row" role="alert">
                <span>{error}</span>
                {retryable !== false && (
                  <button type="button" className="btn quiet" onClick={onRetry}>
                    Try again
                  </button>
                )}
              </div>
            )}
            {explanation && (
              // The explanation is Duet's first message; how it was heard, if it wasn't, goes under it.
              <DuetBubble label="The explanation" below={hearing && HEARING[hearing]}>
                <p className="lead">
                  {explanation.meaning}
                  {explanation.heard && (
                    <span className="heard" title={`Includes how it was said, from the audio (spoken in ${explanation.heard.spokenLanguage})`}>
                      heard
                    </span>
                  )}
                </p>
                {explanation.notice && <p>{explanation.notice.text}</p>}
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
              </DuetBubble>
            )}
          </>
        }
      >
        {(dock) => (
          // The conversation in its own boundary: if it breaks, the explanation stays.
          <ErrorBoundary key={moment.takenAt} what="The conversation">
            <Conversation state={state} language={moment.language} thread={window.duet.explain} dock={dock} mascotSlot={mascotSlot} />
          </ErrorBoundary>
        )}
      </ChatSurface>
    </motion.div>
  )
}
