// The conversation about a line, below its explanation, in text or voice. It is one thread: typed
// messages go to Duet in text; the mic switches to a voice conversation with the same context, and
// when it ends its turns join the thread, so text picks up where voice left off. Card previews
// (save, review) wait for the learner's click or answer; "Use my cards" opens saved cards to Duet.
// Rendered with the line as its key, so a new line starts a new conversation.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExplainState } from '../../../shared/explain'
import { languageModule, speaks } from '../../../shared/languages'
import type { Moment } from '../../../shared/moment'
import type { PendingTutorAction, ReviewRating, TutorActionResult, TutorCard } from '../../../shared/tutor'
import { RATINGS } from '../../../shared/cards'
import { say } from '../components/errors'
import { Mascot, type MascotState } from '../components/Mascot'
import { clock } from '../components/time'
import { ENGLISH_HELP_DELAY_MS, TURN_SETTLE_MS } from './voice/timing'
import { useLiveTutor, type TutorLiveStatus } from './voice/useLiveTutor'
import { Turn, type Aid, type TurnData } from './Turn'

// Common questions that fill in the message box (to send as is, or finish first).
const PILLS = [
  { label: 'Explain more', text: 'Explain more' },
  { label: 'Can I say this?', text: 'Can I say ' }
]

const STATUS: Record<TutorLiveStatus, string> = {
  idle: 'Ready',
  'requesting-microphone': 'Opening the microphone',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  listening: 'Listening',
  speaking: 'Speaking',
  working: 'Checking that',
  ending: 'Ending',
  ended: 'Ready',
  error: 'Voice stopped'
}

const ENDED: TutorLiveStatus[] = ['idle', 'ended', 'error']
// How long Duet looks pleased after a card is saved or a review counted.
const CHEER_MS = 2_000

/** What the mascot shows: pleased for a moment after a save, else what the conversation is doing. */
function mascotState(status: TutorLiveStatus, replying: boolean, cheering: boolean): MascotState {
  if (cheering) return 'success'
  if (status === 'listening') return 'listening'
  if (status === 'speaking') return 'speaking'
  if (!ENDED.includes(status) && status !== 'ending') return 'thinking'
  return replying ? 'thinking' : 'idle'
}

export function Conversation({ state, moment }: { state: ExplainState; moment: Moment }): React.JSX.Element {
  const live = useLiveTutor(moment)
  const { language } = moment
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [meanings, setMeanings] = useState<Record<string, Aid>>({})
  const [readings, setReadings] = useState<Record<string, Aid>>({})
  const [card, setCard] = useState<TutorCard>()
  const [pending, setPending] = useState<PendingTutorAction>()
  const [result, setResult] = useState<TutorActionResult>()
  const [actionError, setActionError] = useState<string>()
  const [explore, setExplore] = useState(false)
  const [cheering, setCheering] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  // What each turn's meaning or romanisation was asked for, so a paid call isn't repeated.
  const translating = useRef(new Map<string, string>())
  const romanising = useRef(new Map<string, string>())
  const helpOffered = useRef(new Set<string>())

  useEffect(() => {
    if (!cheering) return
    const timer = window.setTimeout(() => setCheering(false), CHEER_MS)
    return () => window.clearTimeout(timer)
  }, [cheering])

  const voiceOn = !ENDED.includes(live.status)
  const connected = ['listening', 'speaking', 'working'].includes(live.status)

  useEffect(() => {
    const offCard = window.duet.tutor.onCard(setCard)
    const offPending = window.duet.tutor.onPendingAction((action) => {
      setPending(action)
      setActionError(undefined)
    })
    const offResult = window.duet.tutor.onActionResult((next) => {
      setResult(next)
      if (next.kind === 'saved-card' || next.kind === 'reviewed-card') setCheering(true)
      setPending(undefined)
      setActionError(undefined)
      if (next.kind === 'saved-card' || (next.kind === 'undone' && !next.card)) setCard(undefined)
    })
    return () => {
      offCard()
      offPending()
      offResult()
    }
  }, [])

  // When voice stops, its turns join the thread (each voice session starts with none) and the video
  // may play again.
  const wasOn = useRef(false)
  useEffect(() => {
    if (voiceOn) {
      wasOn.current = true
      return
    }
    if (!wasOn.current) return
    wasOn.current = false
    const turns = live.transcripts.filter((turn) => turn.text.trim())
    if (turns.length) window.duet.explain.voiceTurns(turns.map((turn) => ({ from: turn.role === 'tutor' ? 'duet' : 'learner', text: turn.text })))
    window.duet.tutor.voiceEnded()
  }, [voiceOn, live.transcripts])

  // The thread: what main keeps, then the voice conversation under way.
  const thread: TurnData[] = [
    ...state.chat.map((message, index) => ({ id: `c${index}`, ...message })),
    ...(voiceOn
      ? live.transcripts.map((turn) => ({ id: turn.id, from: turn.role === 'tutor' ? ('duet' as const) : ('learner' as const), text: turn.text, via: 'voice' as const }))
      : [])
  ]

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread.length, state.replying])

  // Romanisation for Duet's turns in the language, once each has settled.
  const romanisable = languageModule(language).reading
    ? thread.filter((turn) => turn.from === 'duet' && speaks(language, turn.text))
    : []
  const romaniseKey = romanisable.map((turn) => `${turn.id}:${turn.text.length}`).join('|')
  useEffect(() => {
    const todo = romanisable.filter((turn) => romanising.current.get(turn.id) !== turn.text)
    if (!todo.length) return
    const timer = window.setTimeout(() => {
      for (const { id, text: source } of todo) {
        romanising.current.set(id, source)
        setReadings((current) => ({ ...current, [id]: { source, loading: true } }))
        window.duet.tutor
          .romanise(source)
          .then((text) => setReadings((current) => (current[id]?.source === source ? { ...current, [id]: { source, loading: false, text } } : current)))
          .catch(() => setReadings((current) => (current[id]?.source === source ? { ...current, [id]: { source, loading: false, failed: true } } : current)))
      }
    }, TURN_SETTLE_MS)
    return () => window.clearTimeout(timer)
    // The key stands for the turns to romanise; the array itself is new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [romaniseKey])

  // In voice, a pause after Duet's turn in the language offers help in English.
  const lastLive = live.transcripts.at(-1)
  const { offerEnglishHelp } = live
  useEffect(() => {
    if (!connected || !lastLive || lastLive.role !== 'tutor' || !speaks(language, lastLive.text)) return
    if (revealed.has(lastLive.id) || helpOffered.current.has(lastLive.id)) return
    const timer = window.setTimeout(() => {
      helpOffered.current.add(lastLive.id)
      offerEnglishHelp()
    }, ENGLISH_HELP_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [connected, lastLive, language, offerEnglishHelp, revealed])

  const reveal = useCallback((turn: TurnData): void => {
    setRevealed((current) => new Set(current).add(turn.id))
    helpOffered.current.add(turn.id)
    if (translating.current.get(turn.id) === turn.text) return
    const { id, text: source } = turn
    translating.current.set(id, source)
    setMeanings((current) => ({ ...current, [id]: { source, loading: true } }))
    window.duet.tutor
      .translate(source)
      .then((text) => setMeanings((current) => (current[id]?.source === source ? { ...current, [id]: { source, loading: false, text } } : current)))
      .catch((error: unknown) => {
        // Pressing Meaning again tries again.
        translating.current.delete(id)
        setMeanings((current) => ({ ...current, [id]: { source, loading: false, error: error instanceof Error ? error.message : 'Could not show the meaning.' } }))
      })
  }, [])

  const hide = useCallback((id: string): void => {
    setRevealed((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const send = (): void => {
    const text = draft.trim()
    if (!text || state.replying || voiceOn) return
    window.duet.explain.ask(text)
    setDraft('')
  }
  const fill = (text: string): void => {
    setDraft(text)
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(text.length, text.length)
    })
  }

  const openCards = async (): Promise<void> => {
    try {
      const enabled = await window.duet.tutor.setExplore(true)
      setExplore(enabled)
    } catch (error) {
      setActionError(say(error, 'Could not open your saved cards to Duet.'))
    }
  }
  const confirm = async (rating?: ReviewRating): Promise<void> => {
    if (!pending) return
    try {
      const next = await window.duet.tutor.confirmAction(pending.id, rating)
      setResult(next)
      setPending(undefined)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not confirm that.')
    }
  }
  const undo = async (): Promise<void> => {
    try {
      setResult(await window.duet.tutor.undo())
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not undo that.')
    }
  }

  const cardMoment = card?.source.kind === 'video' ? card.source.moment : undefined

  return (
    <section className="conversation" aria-label="Conversation with Duet" aria-live="polite">
      {thread.map((turn) => (
        <Turn
          key={turn.id}
          turn={turn}
          language={language}
          revealed={revealed.has(turn.id)}
          meaning={meanings[turn.id]}
          reading={readings[turn.id]}
          onReveal={reveal}
          onHide={hide}
        />
      ))}
      {state.replying && <p className="turn duet muted">…</p>}
      {state.chatError && <p className="notice error">{state.chatError}</p>}

      {card && (
        <section className="action-card" aria-label="A saved card">
          <div className="row">
            <span className="label">Your card</span>
            <span className="spacer" />
            <button type="button" className="btn quiet" aria-label="Close the card" onClick={() => setCard(undefined)}>
              ×
            </button>
          </div>
          <p className="big-line" lang={card.language}>
            {card.expression}
          </p>
          <p>{card.meaning}</p>
          <p className="muted">Remember: {card.target}</p>
          <p className="faint">
            {cardMoment ? `Saved from a video${cardMoment.video.position !== undefined ? ` at ${clock(cardMoment.video.position)}` : ''} · ` : 'Made with Duet · '}
            next review {new Date(card.due).toLocaleDateString()}
          </p>
          <button type="button" className="btn quiet" onClick={() => window.duet.cards.open(card.id)}>
            Open in My cards
          </button>
        </section>
      )}

      {pending?.kind === 'save-card' && (
        <section className="action-card" aria-label="Save this card?">
          <span className="label">Save this card?</span>
          <p className="big-line" lang={language}>
            {pending.draft.expression}
          </p>
          <p>{pending.draft.meaning}</p>
          <p className="muted">Remember: {pending.draft.target}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void confirm()}>
              Save card
            </button>
            <span className="faint">{voiceOn ? 'Or say yes.' : 'Or reply yes.'}</span>
          </div>
        </section>
      )}

      {pending?.kind === 'review-card' && (
        <section className="action-card" aria-label="How well did you remember it?">
          <span className="label">How well did you remember it?</span>
          <p className="big-line" lang={pending.card.language}>
            {pending.card.expression}
          </p>
          <div className="ratings">
            {RATINGS.map((rating) => (
              <button type="button" key={rating} className="rate" onClick={() => void confirm(rating)}>
                <b>{rating}</b>
                <span className="faint">{pending.previews.find((item) => item.rating === rating)?.intervalLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {result && (
        <div className="notice row" role="status">
          <span>{result.message}</span>
          {(result.kind === 'saved-card' || result.kind === 'reviewed-card') && (
            <button type="button" className="btn quiet" onClick={() => void undo()}>
              Undo
            </button>
          )}
        </div>
      )}
      {live.error && <p className="notice error">{live.error}</p>}
      {actionError && <p className="notice error">{actionError}</p>}
      <div ref={end} />

      <div className="composer">
        <div className="composer-mascot">
          <Mascot state={mascotState(live.status, !!state.replying || state.loading, cheering)} scale={voiceOn ? 0.5 : 0.34} />
        </div>
        {voiceOn ? (
          <div className="voice-bar">
            <span className={`voice-state ${live.status}`}>
              <i aria-hidden="true" /> {STATUS[live.status]}
              {live.usageSeconds > 0 && <span className="faint"> · {Math.ceil(live.usageSeconds)}s</span>}
            </span>
            <span className="spacer" />
            <button type="button" className="btn quiet" onClick={live.toggleMicrophone} disabled={!connected}>
              {live.muted ? 'Unmute mic' : 'Mute mic'}
            </button>
            <button type="button" className="btn quiet" onClick={live.speakerBlocked ? live.retryTutorAudio : live.toggleTutorAudio} disabled={!connected}>
              {live.tutorMuted || live.speakerBlocked ? 'Hear Duet' : 'Mute Duet'}
            </button>
            <button type="button" className="btn quiet" onClick={live.requestPronunciationCheck} disabled={!connected}>
              Check my pronunciation
            </button>
            <button type="button" className="btn primary" onClick={live.end} disabled={live.status === 'ending'}>
              End voice
            </button>
          </div>
        ) : (
          <>
            <div className="row">
              {PILLS.map((pill) => (
                <button key={pill.label} type="button" className="pill" onClick={() => fill(pill.text)}>
                  {pill.label}
                </button>
              ))}
              <span className="spacer" />
              <button
                type="button"
                className={`pill${explore ? ' on' : ''}`}
                disabled={explore}
                title="Lets Duet look at your saved cards and earlier lines"
                onClick={() => void openCards()}
              >
                {explore ? 'Cards open to Duet' : 'Use my cards'}
              </button>
            </div>
            <div className="input-row">
              <textarea
                ref={box}
                id="conversation-message"
                rows={1}
                lang={language}
                placeholder="Ask about this line, or practise it"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <button type="button" className="btn primary" disabled={!draft.trim() || state.replying} onClick={send}>
                Send
              </button>
              <button
                type="button"
                className="btn mic"
                title="Talk instead: Duet hears you, and how you say it"
                aria-label="Talk with Duet"
                onClick={() => void live.start()}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="faint">The microphone is used only while you talk. Audio is not saved.</p>
          </>
        )}
      </div>
    </section>
  )
}
