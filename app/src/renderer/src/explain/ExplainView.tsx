// The explanation of one line, as a dictionary entry, the way the back of a card shows it: the line
// as it was heard (Replay), then the expression most worth learning in it (its headword in syllables
// on its rung's highlighter, how it's said with a play button, its part of speech), what it means in
// this line, and, the heart of it, what it means in this scene. Tips are folded under it, and Save
// keeps it as a card. The conversation with Duet opens in the same window from Duet in the panel's
// top bar (Panel.tsx), as Talk opens in the home base: Duet's face at its head, the entry shrunk to a
// short summary under it, and the chat taking the rest, on the surface Talk uses too
// (ChatSurface.tsx, Conversation.tsx).
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { DictionaryEntry, ExplainState, Explanation, HearingNote } from '../../../shared/explain'
import { wordKey } from '../../../shared/knowledge'
import { languageName } from '../../../shared/languages'
import type { Moment } from '../../../shared/moment'
import { clock } from '../components/time'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { DURATION, fade, fadeUp } from '../components/motion'
import { useRung } from '../components/useRung'
import type { Language } from '../../../shared/languages'
import { ChatSurface } from './ChatSurface'
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

// Duet at the head of the chat, the size it is at the head of Talk (420 x 190 at full size).
const TALK_MASCOT_SCALE = 64 / 420

/** Says `text` in the language being learnt, with the system's voice for it (when there is one). */
function pronounce(text: string, language: Language): void {
  if (!('speechSynthesis' in window)) return
  const voices = speechSynthesis.getVoices()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language
  utterance.rate = 0.85
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase())) ?? null
  speechSynthesis.cancel()
  speechSynthesis.speak(utterance)
}

/** The line, with the quoted words on their rung's highlighter when they are in it. */
function LineWithQuote({ text, quote, language }: { text: string; quote?: string; language: Language }): React.JSX.Element {
  const rung = useRung(language, quote ? wordKey(language, quote) : undefined)
  const at = quote ? text.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase()) : -1
  if (!quote || at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="w quote-word" data-k={rung ?? 'unknown'}>
        {text.slice(at, at + quote.length)}
      </span>
      {text.slice(at + quote.length)}
    </>
  )
}

/** Where the line came from, the line, its English, and Replay. */
function Heard({ moment, quote, onReplay }: { moment: Moment; quote?: string; onReplay: () => void }): React.JSX.Element {
  const position = moment.video.position
  return (
    <div className="heard-line">
      <p className="line-source">
        <Icon name="video" size={13} />
        <span className="line-title">{moment.video.title ?? languageName(moment.language)}</span>
        {position !== undefined && <span className="line-time">{clock(position)}</span>}
        <span className="spacer" />
        {position !== undefined && (
          <button type="button" className="line-replay" onClick={onReplay} aria-label="Replay the line in the video">
            <Icon name="replay" size={13} />
            Replay
          </button>
        )}
      </p>
      <p className="line" lang={moment.language}>
        <LineWithQuote text={moment.line.original} quote={quote} language={moment.language} />
      </p>
      {moment.line.processed && <p className="line-english">{moment.line.processed.translation}</p>}
    </div>
  )
}

/** The headword, how it is said and what it is: the top of a dictionary entry. */
function Headword({ entry, language, quote }: { entry: DictionaryEntry; language: Language; quote?: string }): React.JSX.Element {
  const rung = useRung(language, wordKey(language, quote ?? entry.headword))
  return (
    <div className="entry-head">
      <h2 className="entry-word" lang={language}>
        <span className="w" data-k={rung ?? 'unknown'}>
          {entry.syllables ?? entry.headword}
        </span>
      </h2>
      <p className="entry-say">
        {entry.ipa && <span className="entry-ipa">/{entry.ipa}/</span>}
        <button
          type="button"
          className="entry-play"
          aria-label={`Hear “${entry.headword}”`}
          title="Hear it"
          onClick={() => pronounce(entry.headword, language)}
        >
          <Icon name="volume" size={13} />
        </button>
        {entry.partOfSpeech && <span className="entry-pos">{entry.partOfSpeech}</span>}
      </p>
    </div>
  )
}

/** The rest of the explanation, folded: why, another way to say it, doubt, other meanings, the lines
 * before. Nothing to fold, no row. */
function Tips({ explanation, moment }: { explanation: Explanation; moment: Moment }): React.JSX.Element | null {
  const others = explanation.entry?.otherMeanings ?? []
  const any =
    explanation.why || explanation.alternative || explanation.limitation || others.length > 0 || moment.earlier.length > 0
  if (!any) return null
  return (
    <details className="entry-tips">
      <summary>
        Tips
        <span className="tips-arrow" aria-hidden="true" />
      </summary>
      <div className="tips-body">
        {explanation.why && (
          <section className="part">
            <h3 className="label">Why here</h3>
            <p>{explanation.why}</p>
          </section>
        )}
        {explanation.alternative && (
          <section className="part">
            <h3 className="label">Another way to say it</h3>
            <p className="quote" lang={moment.language}>
              {explanation.alternative.expression}
            </p>
            <p>{explanation.alternative.changes}</p>
          </section>
        )}
        {others.length > 0 && (
          <section className="part">
            <h3 className="label">Other meanings</h3>
            <p>{others.join(' · ')}</p>
          </section>
        )}
        {explanation.limitation && (
          <section className="part">
            <h3 className="label">Not sure about</h3>
            <p className="muted">{explanation.limitation}</p>
          </section>
        )}
        {moment.earlier.length > 0 && (
          <section className="part">
            <h3 className="label">Lines before</h3>
            {moment.earlier.map((line, index) => (
              <p key={index}>
                <span lang={moment.language}>{line.original}</span>
                {line.translation && <span className="muted"> {line.translation}</span>}
              </p>
            ))}
          </section>
        )}
      </div>
    </details>
  )
}

/** The whole entry: the line heard, the headword, its meaning here, the scene, tips and Save. */
function Entry({ state, onReplay, onRetry }: { state: ExplainState; onReplay: () => void; onRetry: () => void }): React.JSX.Element {
  const { moment, explanation, loading, stage, hearing, error, retryable } = state
  if (!moment) return <></>
  const entry = explanation?.entry
  const quote = explanation?.notice?.quote
  return (
    <motion.article className="entry" aria-label="The explanation" {...fadeUp(6)}>
      <Heard moment={moment} quote={quote} onReplay={onReplay} />

      {/* Duet at work: dots, as it listens, then explains. */}
      {loading && (
        <p className="entry-typing typing">
          {stage === 'listening' ? 'Listening' : 'Explaining'}
          <span className="typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
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
        <>
          {entry && (
            <section className="entry-word-part">
              <Headword entry={entry} language={moment.language} quote={quote} />
              <p className="entry-gloss">{explanation.card.meaning}</p>
              {entry.usually && <p className="entry-usually">Usually: {entry.usually}</p>}
            </section>
          )}
          <section className="entry-scene">
            <h3 className="entry-label">
              In this scene
              {explanation.heard && (
                <span className="heard" title={`Includes how it was said, from the audio (spoken in ${explanation.heard.spokenLanguage})`}>
                  heard
                </span>
              )}
            </h3>
            <p className="entry-meaning">{explanation.meaning}</p>
            {explanation.notice && <p className="entry-notice">{explanation.notice.text}</p>}
            {hearing && HEARING[hearing] && <p className="entry-hearing">{HEARING[hearing]}</p>}
          </section>
          <Tips explanation={explanation} moment={moment} />
          <div className="entry-actions">
            <SaveCard key={moment.takenAt} moment={moment} explanation={explanation} />
          </div>
        </>
      )}
    </motion.article>
  )
}

/** The entry in one line, above the chat: the line, and the headword with its meaning here. Pressed,
 * it goes back to the whole entry. */
function Summary({ state, onBack }: { state: ExplainState; onBack: () => void }): React.JSX.Element | null {
  const { moment, explanation } = state
  if (!moment) return null
  return (
    <button type="button" className="entry-summary" onClick={onBack} aria-label="Back to the explanation">
      <span className="summary-line" lang={moment.language}>
        <LineWithQuote text={moment.line.original} quote={explanation?.notice?.quote} language={moment.language} />
      </span>
      {explanation && (
        <span className="summary-gloss">
          {explanation.entry && <b lang={moment.language}>{explanation.entry.headword}</b>}
          {explanation.card.meaning}
        </span>
      )}
    </button>
  )
}

export function ExplainView({
  state,
  onReplay,
  onRetry,
  chatOpen,
  onCloseChat
}: {
  state: ExplainState
  onReplay: () => void
  onRetry: () => void
  /** The conversation with Duet is open (Duet in the top bar). */
  chatOpen: boolean
  onCloseChat: () => void
}): React.JSX.Element {
  const { moment, error } = state
  const [mascotSlot, setMascotSlot] = useState<HTMLElement | null>(null)
  if (!moment)
    return error ? (
      <p className="notice error" role="alert">
        {error}
      </p>
    ) : (
      <p className="muted center">Press Explain on the strip, or on a line in Script.</p>
    )
  return (
    <motion.div className={`explain-tab${chatOpen ? ' is-chatting' : ''}`} {...fade(DURATION.fast)}>
      <AnimatePresence mode="wait" initial={false}>
        {chatOpen ? (
          <motion.div key="chat" className="explain-chat" {...fade(DURATION.fast)}>
            {/* Duet at the head of the conversation, as at the head of Talk: it wakes up as the chat
                opens, then shows what it is doing. */}
            <div className="home-talk-head">
              <div className="head-slot" ref={setMascotSlot} />
              <span className="talk-sub">About this line</span>
            </div>
            <ChatSurface top={<Summary state={state} onBack={onCloseChat} />}>
              {(dock) => (
                // The conversation in its own boundary: if it breaks, the explanation stays.
                <ErrorBoundary key={moment.takenAt} what="The conversation">
                  <Conversation state={state} language={moment.language} thread={window.duet.explain} dock={dock} mascotSlot={mascotSlot} mascotScale={TALK_MASCOT_SCALE} />
                </ErrorBoundary>
              )}
            </ChatSurface>
          </motion.div>
        ) : (
          <motion.div key="entry" className="explain-entry" {...fade(DURATION.fast)}>
            <Entry state={state} onReplay={onReplay} onRetry={onRetry} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
