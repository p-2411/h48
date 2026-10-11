// Duet keeps the current video phrase close without letting it crowd out the conversation. Voice,
// hidden meanings, cards and confirmations share one readable surface.
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Moment } from '../../../shared/moment'
import type {
  PendingTutorAction,
  ReviewRating,
  TutorActionResult,
  TutorCard
} from '../../../shared/tutor'
import { languageModule, languageName, speaks, type Language } from '../../../shared/languages'
import { clock } from '../components/time'
import { DuetMascot } from './DuetMascot'
import { ENGLISH_HELP_DELAY_MS, TURN_SETTLE_MS } from './timing'
import { useLiveTutor, type TranscriptSegment, type TutorLiveStatus } from './useLiveTutor'

const STATUS: Record<TutorLiveStatus, string> = {
  idle: 'Ready',
  'requesting-microphone': 'Opening microphone',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  listening: 'Listening',
  speaking: 'Speaking',
  working: 'Checking that',
  ending: 'Ending',
  ended: 'Ready',
  error: 'Needs attention'
}

const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy']

type Translation = { source: string; loading: boolean; text?: string; error?: string }
type Pronunciation = { source: string; loading: boolean; text?: string; failed?: boolean }

function EyeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.4-5.2 9.5-5.2 9.5 5.2 9.5 5.2-3.4 5.2-9.5 5.2S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

function CardsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3.5" width="13" height="16" rx="2.5" />
      <path d="M8 7.5h5M8 11h5M8 14.5h3.5M17 7h1.5A1.5 1.5 0 0 1 20 8.5v10a2 2 0 0 1-2 2h-8" />
    </svg>
  )
}

type TurnViewProps = {
  turn: TranscriptSegment
  language: Language
  /** The live status for the latest Duet turn; 'idle' for older ones so their mascots rest. */
  status: TutorLiveStatus
  revealed: boolean
  translation?: Translation
  pronunciation?: Pronunciation
  onReveal: (turn: TranscriptSegment) => void
  onHide: (turnId: string) => void
}

/** One turn of the conversation. Memoised, so a streaming turn doesn't re-render all the others. */
const TurnView = memo(function TurnView({
  turn,
  language,
  status,
  revealed,
  translation,
  pronunciation,
  onReveal,
  onHide
}: TurnViewProps): React.JSX.Element {
  const canReveal = turn.role === 'tutor' && speaks(language, turn.text)
  return (
    <article className={`turn ${turn.role}`}>
      <header className="turn-heading">
        <span className="speaker">
          {turn.role === 'tutor' && <DuetMascot status={status} small />}
          {turn.role === 'learner' ? 'You' : 'Duet'}
        </span>
        {canReveal && (
          <button
            type="button"
            className={`meaning-button${revealed ? ' is-on' : ''}`}
            aria-label={revealed ? 'Hide English meaning' : 'Reveal English meaning'}
            title={revealed ? 'Hide English meaning' : 'Reveal English meaning'}
            onClick={() => (revealed ? onHide(turn.id) : onReveal(turn))}
          >
            <EyeIcon />
            <span>{revealed ? 'Hide meaning' : 'Meaning'}</span>
          </button>
        )}
      </header>
      <p className="turn-text" lang={canReveal ? language : undefined}>
        {turn.text}
      </p>
      {canReveal && pronunciation?.text && (
        <p className="turn-pronunciation" aria-label={`${languageName(language)} pronunciation`}>
          {pronunciation.text}
        </p>
      )}
      {revealed && (
        <p className={`turn-meaning${translation?.error ? ' has-error' : ''}`}>
          {translation?.loading
            ? 'Revealing meaning…'
            : (translation?.text ?? translation?.error ?? 'Meaning unavailable.')}
        </p>
      )}
    </article>
  )
})

export function Tutor(): React.JSX.Element {
  const [moment, setMoment] = useState<Moment>()
  const [card, setCard] = useState<TutorCard>()
  const [pending, setPending] = useState<PendingTutorAction>()
  const [result, setResult] = useState<TutorActionResult>()
  const [actionError, setActionError] = useState<string>()
  const [closeAfterEnd, setCloseAfterEnd] = useState(false)
  const [contextOpen, setContextOpen] = useState(true)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [translations, setTranslations] = useState<Record<string, Translation>>({})
  const [pronunciations, setPronunciations] = useState<Record<string, Pronunciation>>({})
  const [autoStartPending, setAutoStartPending] = useState(false)
  const [exploreEnabled, setExploreEnabled] = useState(false)
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const helpOffered = useRef(new Set<string>())
  // The text each turn's pronunciation or meaning was last asked for, so a paid call isn't
  // repeated for the same words, even after a failure.
  const pronouncing = useRef(new Map<string, string>())
  const translating = useRef(new Map<string, string>())
  const autoStartClaimed = useRef(false)
  const live = useLiveTutor(moment)

  useEffect(() => {
    let mounted = true
    Promise.all([window.duet.tutor.getMoment(), window.duet.tutor.getAutoStart()]).then(
      ([next, autoStart]) => {
        if (!mounted) return
        setMoment(next)
        autoStartClaimed.current = false
        setAutoStartPending(autoStart)
      }
    )
    const offMoment = window.duet.tutor.onMoment((next) => {
      setMoment(next)
      setCard(undefined)
      setPending(undefined)
      setResult(undefined)
      setContextOpen(true)
      setRevealed(new Set())
      setTranslations({})
      setPronunciations({})
      pronouncing.current.clear()
      translating.current.clear()
      setExploreEnabled(false)
      autoStartClaimed.current = false
      helpOffered.current.clear()
    })
    const offAutoStart = window.duet.tutor.onAutoStart((autoStart) => {
      autoStartClaimed.current = false
      setAutoStartPending(autoStart)
    })
    const offCard = window.duet.tutor.onCard(setCard)
    const offPending = window.duet.tutor.onPendingAction((action) => {
      setPending(action)
      setActionError(undefined)
    })
    const offResult = window.duet.tutor.onActionResult((next) => {
      setResult(next)
      setPending(undefined)
      setActionError(undefined)
      if (next.kind === 'saved-card') setCard(undefined)
      if (next.kind === 'undone' && !next.card) setCard(undefined)
    })
    return () => {
      mounted = false
      offMoment()
      offAutoStart()
      offCard()
      offPending()
      offResult()
    }
  }, [])

  useEffect(() => {
    if (
      !moment ||
      !autoStartPending ||
      autoStartClaimed.current ||
      !['idle', 'ended', 'error'].includes(live.status)
    )
      return
    autoStartClaimed.current = true
    setAutoStartPending(false)
    void live.start()
  }, [autoStartPending, live, moment])

  useEffect(() => {
    // Chromium can return a Promise here. Never return it from an effect: React would treat it as
    // a cleanup callback and crash Duet as soon as the transcript changes.
    // Only a new turn scrolls; scrolling on every streamed word made the view jitter.
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [live.transcripts.length])

  // Fold the phrase away when the first turn arrives. Adjusting state while rendering is React's
  // pattern for this; an effect would cost an extra render pass.
  const hasTurns = live.transcripts.length > 0
  const [hadTurns, setHadTurns] = useState(hasTurns)
  if (hasTurns !== hadTurns) {
    setHadTurns(hasTurns)
    if (hasTurns) setContextOpen(false)
  }

  useEffect(() => {
    if (closeAfterEnd && live.status === 'ended') window.duet.tutor.close()
  }, [closeAfterEnd, live.status])

  const lastTurn = live.transcripts.at(-1)
  const { offerEnglishHelp } = live
  useEffect(() => {
    if (
      !lastTurn ||
      lastTurn.role !== 'tutor' ||
      !(moment && speaks(moment.language, lastTurn.text)) ||
      revealed.has(lastTurn.id) ||
      helpOffered.current.has(lastTurn.id)
    )
      return
    const timer = window.setTimeout(() => {
      helpOffered.current.add(lastTurn.id)
      offerEnglishHelp()
    }, ENGLISH_HELP_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [lastTurn, moment, offerEnglishHelp, revealed])

  useEffect(() => {
    if (!lastTurn || lastTurn.role !== 'tutor' || !moment || !languageModule(moment.language).reading) return
    if (!speaks(moment.language, lastTurn.text)) return
    const { id, text: source } = lastTurn
    if (pronouncing.current.get(id) === source) return
    // Wait for the turn to settle, so a half-spoken turn isn't sent and then sent again.
    const timer = window.setTimeout(() => {
      pronouncing.current.set(id, source)
      setPronunciations((current) => ({ ...current, [id]: { source, loading: true } }))
      // Results for words the turn has since outgrown are dropped.
      window.duet.tutor
        .pronounce(source)
        .then((text) =>
          setPronunciations((current) =>
            current[id]?.source === source
              ? { ...current, [id]: { source, loading: false, text } }
              : current
          )
        )
        .catch(() =>
          setPronunciations((current) =>
            current[id]?.source === source
              ? { ...current, [id]: { source, loading: false, failed: true } }
              : current
          )
        )
    }, TURN_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [lastTurn, moment])

  const requestTranslation = useCallback((id: string, source: string): void => {
    if (translating.current.get(id) === source) return
    translating.current.set(id, source)
    setTranslations((current) => ({ ...current, [id]: { source, loading: true } }))
    // Results for words the turn has since outgrown are dropped.
    window.duet.tutor
      .translate(source)
      .then((text) =>
        setTranslations((current) =>
          current[id]?.source === source
            ? { ...current, [id]: { source, loading: false, text } }
            : current
        )
      )
      .catch((error: unknown) => {
        // Let the learner retry by pressing Meaning again.
        if (translating.current.get(id) === source) translating.current.delete(id)
        setTranslations((current) =>
          current[id]?.source === source
            ? {
                ...current,
                [id]: {
                  source,
                  loading: false,
                  error: error instanceof Error ? error.message : 'Could not reveal the meaning.'
                }
              }
            : current
        )
      })
  }, [])

  // A meaning revealed while Duet was still speaking covers only part of the turn. Ask again for
  // the whole turn once it settles.
  useEffect(() => {
    if (!lastTurn || !revealed.has(lastTurn.id)) return
    const asked = translating.current.get(lastTurn.id)
    if (asked === undefined || asked === lastTurn.text) return
    const timer = window.setTimeout(
      () => requestTranslation(lastTurn.id, lastTurn.text),
      TURN_SETTLE_MS
    )
    return () => window.clearTimeout(timer)
  }, [lastTurn, revealed, requestTranslation])

  const reveal = useCallback(
    (turn: TranscriptSegment): void => {
      setRevealed((current) => new Set(current).add(turn.id))
      helpOffered.current.add(turn.id)
      requestTranslation(turn.id, turn.text)
    },
    [requestTranslation]
  )

  const hideMeaning = useCallback((turnId: string): void => {
    setRevealed((current) => {
      const next = new Set(current)
      next.delete(turnId)
      return next
    })
  }, [])

  if (!moment)
    return (
      <main className="tutor empty">Choose a phrase in Duet before starting a conversation.</main>
    )

  const processed = moment.line.processed
  const isFixture = moment.video.url?.startsWith('fixture:')
  const sourceName = moment.video.site === 'youtube' ? 'YouTube' : 'Netflix'
  const sourceLabel = isFixture ? 'Demo phrase' : `From ${sourceName}`
  const connected = ['listening', 'speaking', 'working'].includes(live.status)
  const canStart = ['idle', 'ended', 'error'].includes(live.status)
  const cardMoment = card?.source.kind === 'video' ? card.source.moment : undefined
  const latestRating = card?.reviews.filter((review) => !review.undone).at(-1)?.rating
  const lastTutorId = live.transcripts.findLast((turn) => turn.role === 'tutor')?.id

  const explore = async (): Promise<void> => {
    try {
      const enabled = await window.duet.tutor.setExplore(true)
      setExploreEnabled(enabled)
      if (enabled) live.enableExplore()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not enable saved history.')
    }
  }

  const confirm = async (rating?: ReviewRating): Promise<void> => {
    if (!pending) return
    try {
      const next = await window.duet.tutor.confirmAction(pending.id, rating)
      setResult(next)
      setPending(undefined)
      if (next.kind === 'saved-card') setCard(undefined)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not confirm that action.')
    }
  }

  const undo = async (): Promise<void> => {
    try {
      const next = await window.duet.tutor.undo()
      setResult(next)
      if (!next.card) setCard(undefined)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not undo that action.')
    }
  }

  const close = (): void => {
    if (!connected && live.status !== 'connecting' && live.status !== 'ending')
      return window.duet.tutor.close()
    setCloseAfterEnd(true)
    live.end()
  }

  return (
    <main className="tutor">
      <header className="tutor-header">
        <div className="tutor-brand">
          <DuetMascot status={live.status} small />
          <div>
            <h1>Duet</h1>
            <span className={`live-state state-${live.status}`}>
              <i aria-hidden="true" /> {STATUS[live.status]}
            </span>
          </div>
        </div>
        <button type="button" className="icon-button close" aria-label="Close Duet" onClick={close}>
          ×
        </button>
      </header>

      <section className={`practice-context${contextOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="context-summary"
          aria-expanded={contextOpen}
          onClick={() => setContextOpen((open) => !open)}
        >
          <span>
            <span className="eyebrow">{sourceLabel}</span>
            <span className="context-phrase" lang={moment.language}>
              {moment.line.original}
            </span>
          </span>
          <span className="context-chevron" aria-hidden="true">
            {contextOpen ? '−' : '+'}
          </span>
        </button>
        {contextOpen && (
          <div className="context-details">
            {processed && <p className="english">{processed.translation}</p>}
            <p className="meta">
              {languageName(moment.language)}
              {moment.video.position !== undefined && ` · ${clock(moment.video.position)}`}
            </p>
            {moment.earlier.length > 0 && (
              <details className="earlier-context">
                <summary>Show earlier dialogue ({moment.earlier.length})</summary>
                {moment.earlier.map((line, index) => (
                  <p key={`${line.original}-${index}`}>
                    <span lang={moment.language}>{line.original}</span>
                    {line.translation && <span className="english"> {line.translation}</span>}
                  </p>
                ))}
              </details>
            )}
          </div>
        )}
      </section>

      <section className="conversation" aria-label="Conversation with Duet" aria-live="polite">
        {canStart && live.transcripts.length === 0 && (
          <div className="start-card">
            <DuetMascot status={live.status} />
            <div>
              <h2>Talk with Duet</h2>
              <p>
                Speak naturally. Duet corrects meaningful {languageName(moment.language)} mistakes, models clear native
                pronunciation, and lets you try again.
              </p>
            </div>
            <button type="button" className="primary" onClick={() => void live.start()}>
              Converse
            </button>
            <p className="privacy">
              Your microphone is used only after you start. Audio and full transcripts are not saved
              locally.
            </p>
          </div>
        )}

        {!canStart && live.transcripts.length === 0 && (
          <div className="conversation-waiting">
            <DuetMascot status={live.status} />
            <p>{STATUS[live.status]}…</p>
          </div>
        )}

        {live.transcripts.map((turn) => (
          <TurnView
            key={turn.id}
            turn={turn}
            language={moment.language}
            status={turn.id === lastTutorId ? live.status : 'idle'}
            revealed={revealed.has(turn.id)}
            translation={translations[turn.id]}
            pronunciation={pronunciations[turn.id]}
            onReveal={reveal}
            onHide={hideMeaning}
          />
        ))}

        {card && (
          <section className="opened-card" aria-label="Earlier encounter">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Earlier encounter</span>
                <span className="source-badge">
                  {card.source.kind === 'video' ? 'Video' : 'Made with Duet'}
                </span>
              </div>
              <button
                type="button"
                className="icon-button dismiss-card"
                aria-label="Dismiss earlier encounter"
                onClick={() => setCard(undefined)}
              >
                ×
              </button>
            </div>
            <p className="card-expression" lang={card.language}>
              {card.expression}
            </p>
            <p>{card.meaning}</p>
            <p className="card-target">Remember: {card.target}</p>
            {card.situation && <p className="card-context">{card.situation}</p>}
            {card.explanation && (
              <details className="card-nuance">
                <summary>Nuance analysis</summary>
                <p>{card.explanation.meaning}</p>
                {card.explanation.notice && <p>{card.explanation.notice.text}</p>}
                {card.explanation.why && <p>{card.explanation.why}</p>}
              </details>
            )}
            <p className="meta">
              {cardMoment
                ? `Saved from video${cardMoment.video.position !== undefined ? ` at ${clock(cardMoment.video.position)}` : ''} · `
                : 'Made with Duet · '}
              Next review {new Date(card.due).toLocaleString()}
              {latestRating && ` · Last rated ${latestRating}`}
            </p>
            <button
              type="button"
              className="secondary compact"
              onClick={() => window.duet.cards.open(card.id)}
            >
              View in My cards
            </button>
          </section>
        )}

        {pending?.kind === 'save-card' && (
          <section className="pending-action" aria-label="Confirm card save">
            <span className="eyebrow">Confirm save</span>
            <p className="card-expression" lang={moment.language}>
              {pending.draft.expression}
            </p>
            <p>{pending.draft.meaning}</p>
            <p className="card-target">Learning target: {pending.draft.target}</p>
            <div className="action-row">
              <button type="button" className="primary compact" onClick={() => void confirm()}>
                Save card
              </button>
              <span>You can also confirm by voice.</span>
            </div>
          </section>
        )}

        {pending?.kind === 'review-card' && (
          <section className="pending-action" aria-label="Choose review rating">
            <span className="eyebrow">How well did you recall it?</span>
            <p className="card-expression" lang={pending.card.language}>
              {pending.card.expression}
            </p>
            <div className="ratings">
              {RATINGS.map((rating) => {
                const preview = pending.previews.find((item) => item.rating === rating)
                return (
                  <button type="button" key={rating} onClick={() => void confirm(rating)}>
                    <strong>{rating}</strong>
                    <span>{preview?.intervalLabel}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {result && (
          <div className="toast" role="status">
            <span>{result.message}</span>
            {(result.kind === 'saved-card' || result.kind === 'reviewed-card') && (
              <button type="button" onClick={() => void undo()}>
                Undo
              </button>
            )}
          </div>
        )}
        {live.error && <p className="notice error-notice">{live.error}</p>}
        {actionError && <p className="notice error-notice">{actionError}</p>}
        <div ref={transcriptEnd} />
      </section>

      <footer className="tutor-actions">
        <button type="button" className="cards-button" onClick={() => window.duet.cards.open()}>
          <CardsIcon />
          My cards
        </button>
        <button
          type="button"
          className={`explore-button${exploreEnabled ? ' is-on' : ''}`}
          onClick={() => void explore()}
          disabled={!connected || exploreEnabled}
          aria-pressed={exploreEnabled}
          title="Only this unlocks saved cards and earlier learning history"
        >
          {exploreEnabled ? 'History unlocked' : 'Explore further'}
        </button>
        {canStart && live.transcripts.length > 0 && (
          <button type="button" className="primary compact" onClick={() => void live.start(true)}>
            Reconnect
          </button>
        )}
        {!canStart && (
          <div className="voice-controls">
            <button
              type="button"
              className={live.muted ? 'is-on' : ''}
              onClick={live.toggleMicrophone}
              disabled={!connected}
            >
              {live.muted ? 'Unmute mic' : 'Mute mic'}
            </button>
            <button
              type="button"
              className={live.tutorMuted || live.speakerBlocked ? 'is-on' : ''}
              onClick={live.speakerBlocked ? live.retryTutorAudio : live.toggleTutorAudio}
              disabled={!connected}
            >
              {live.tutorMuted || live.speakerBlocked ? 'Hear Duet' : 'Mute Duet'}
            </button>
            <button type="button" onClick={live.requestPronunciationCheck} disabled={!connected}>
              Pronunciation
            </button>
            <button
              type="button"
              className="end"
              onClick={live.end}
              disabled={live.status === 'ending'}
            >
              End
            </button>
            {live.usageSeconds > 0 && (
              <span className="usage">{Math.ceil(live.usageSeconds)}s</span>
            )}
          </div>
        )}
      </footer>
    </main>
  )
}
