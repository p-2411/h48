// The conversation about a line, below its explanation, in text or voice. It is one thread: typed
// messages go to Duet in text; the mic switches to a voice conversation with the same context, and
// when it ends its turns join the thread, so text picks up where voice left off. Card previews
// (save, review) wait for the learner's click or answer; "Use my cards" opens saved cards to Duet.
// Rendered with the line as its key, so a new line starts a new conversation (and a new voice hook).
// The composer renders into `dock`, the tab's slot below its scrolling part.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExplainState } from '../../../shared/explain'
import type { Moment } from '../../../shared/moment'
import { say } from '../components/errors'
import { Mascot, type MascotState } from '../components/Mascot'
import { CardPreview, OpenedCard } from './CardPreview'
import { Composer } from './Composer'
import { Turn, type TurnData } from './Turn'
import { useCardActions } from './useCardActions'
import { useMascotFlight } from './useMascotFlight'
import { useTurnAids } from './useTurnAids'
import { useEnglishHelp, useVoiceHandoff } from './useVoiceHandoff'
import { VoiceBar } from './VoiceBar'
import { isVoiceOn, useLiveTutor, type TutorLiveStatus } from './voice/useLiveTutor'

// How long the mascot gently corrects after a reply that corrects the learner: one cycle of its
// correction animation (mascot.css).
const CORRECTION_MS = 3_800

/** What the mascot shows: pleased for a moment after a save, gently correcting for a moment after a
 * reply that corrects the learner, else what the conversation is doing. */
function mascotState(
  status: TutorLiveStatus,
  replying: boolean,
  cheering: boolean,
  correcting: boolean
): MascotState {
  if (cheering) return 'success'
  if (status === 'listening') return 'listening'
  if (status === 'speaking') return 'speaking'
  if (isVoiceOn(status) && status !== 'ending') return 'thinking'
  if (replying) return 'thinking'
  return correcting ? 'correction' : 'idle'
}

/** Whether the turn `turnId` (Duet's newest reply, when it corrects the learner) is still being
 * shown as a correction: true from when it arrives until CORRECTION_MS later. */
function useCorrection(turnId: string | undefined): boolean {
  const [done, setDone] = useState<string>()
  useEffect(() => {
    if (!turnId || turnId === done) return
    const timer = window.setTimeout(() => setDone(turnId), CORRECTION_MS)
    return () => window.clearTimeout(timer)
  }, [turnId, done])
  return !!turnId && turnId !== done
}

export function Conversation({
  state,
  moment,
  dock
}: {
  state: ExplainState
  moment: Moment
  dock: HTMLElement | null
}): React.JSX.Element {
  const live = useLiveTutor(moment)
  const { language } = moment
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const section = useRef<HTMLElement>(null)
  const dockMascot = useRef<HTMLDivElement>(null)
  const cards = useCardActions()
  const endButton = useVoiceHandoff(live, box)
  const voiceOn = isVoiceOn(live.status)

  // The thread: what main keeps, then the voice conversation under way.
  const thread: TurnData[] = [
    ...state.chat.map((message, index) => ({ id: `c${index}`, ...message })),
    ...(voiceOn
      ? live.transcripts.map((turn) => ({
          id: turn.id,
          from: turn.role === 'tutor' ? ('duet' as const) : ('learner' as const),
          text: turn.text,
          via: 'voice' as const
        }))
      : [])
  ]
  const aids = useTurnAids(thread, language)
  useEnglishHelp(live, language, aids.revealed, aids.wasRevealed)

  // Keep the newest thing in view: a turn (or a voice turn growing), Duet replying, a card, a result
  // or an error. On opening, with nothing in the conversation yet, the explanation stays in view.
  const watched = [
    thread.length,
    thread.at(-1)?.text.length,
    state.replying,
    cards.card?.id,
    cards.pending?.id,
    cards.result?.actionId,
    state.chatError,
    live.error,
    cards.actionError
  ]
  const scrollKey = watched.join('|')
  const empty = watched.every((part) => !part)
  useEffect(() => {
    if (!empty) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [scrollKey, empty])

  // A failed text reply can be asked again: main sends the same message without adding it twice.
  const last = state.chat.at(-1)
  const correcting = useCorrection(
    last?.from === 'duet' && last.correction ? `c${state.chat.length - 1}` : undefined
  )
  const unanswered =
    state.chatError &&
    !state.replying &&
    !voiceOn &&
    last?.from === 'learner' &&
    last.via === 'text'
      ? last.text
      : undefined
  const { result } = cards
  // Duet's typed reply arrives: the mascot flies from the dock to become its picture.
  useMascotFlight(
    last?.from === 'duet' && last.via === 'text' ? `c${state.chat.length - 1}` : undefined,
    dockMascot,
    section,
    end
  )

  return (
    <section className="conversation" aria-label="Conversation with Duet" ref={section}>
      {thread.map((turn, index) => (
        <Turn
          key={turn.id}
          id={turn.id}
          from={turn.from}
          text={turn.text}
          via={turn.via}
          avatar={turn.from === 'duet' && thread[index + 1]?.from !== 'duet'}
          language={language}
          revealed={aids.revealed.has(turn.id)}
          meaning={aids.meanings[turn.id]}
          reading={aids.readings[turn.id]}
          onReveal={aids.reveal}
          onHide={aids.hide}
        />
      ))}

      {cards.card && <OpenedCard card={cards.card} onClose={cards.closeCard} />}
      {cards.pending && (
        <CardPreview
          pending={cards.pending}
          language={language}
          voiceOn={voiceOn}
          busy={cards.busy}
          onConfirm={cards.confirm}
        />
      )}

      {/* Results and errors are announced; the turns and the composer are not, so streaming voice
          doesn't flood a screen reader. Always rendered, so a new notice is read out. */}
      <div className="notices" role="status">
        {/* Duet writing, then its typed reply, for screen readers (the mascot shows it thinking;
            spoken voice turns are heard already). */}
        <span className="sr-only">
          {state.replying
            ? 'Duet is replying…'
            : last?.from === 'duet' && last.via === 'text'
              ? `Duet: ${last.text}`
              : ''}
        </span>
        {result && (
          <div className="notice row">
            <span>{result.message}</span>
            {(result.kind === 'saved-card' || result.kind === 'reviewed-card') && (
              <button
                type="button"
                className="btn quiet"
                disabled={cards.busy}
                onClick={cards.undo}
              >
                Undo
              </button>
            )}
          </div>
        )}
        {state.chatError && (
          <div className="notice error row">
            <span>{say(state.chatError, 'Could not answer that.')}</span>
            {unanswered && (
              <button
                type="button"
                className="btn quiet"
                onClick={() => window.duet.explain.ask(unanswered)}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {live.error && (
          <div className="notice error row">
            <span>{live.error}</span>
            {live.status === 'error' && (
              <>
                {live.microphoneBlocked && window.duet.welcome.asksPermissions && (
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => window.duet.welcome.openSettings('microphone')}
                  >
                    Open System Settings
                  </button>
                )}
                <button type="button" className="btn quiet" onClick={() => void live.start()}>
                  Try voice again
                </button>
              </>
            )}
          </div>
        )}
        {cards.actionError && <p className="notice error">{cards.actionError}</p>}
      </div>

      {dock &&
        createPortal(
          <div className="composer">
            <div className="composer-mascot" ref={dockMascot}>
              <Mascot
                state={mascotState(
                  live.status,
                  !!state.replying || state.loading,
                  cards.cheering,
                  correcting
                )}
                scale={voiceOn ? 0.5 : 0.34}
              />
            </div>
            {isVoiceOn(live.status) ? (
              <VoiceBar live={live} status={live.status} endButton={endButton} />
            ) : (
              <Composer
                box={box}
                draft={draft}
                onDraft={setDraft}
                language={language}
                replying={!!state.replying}
                explore={cards.explore}
                onOpenCards={cards.openCards}
                onStartVoice={() => void live.start()}
              />
            )}
          </div>,
          dock
        )}
      {/* Last in the scrolling part: scrolling here brings the newest turn to the bottom of it,
          just above the composer. */}
      <div ref={end} aria-hidden="true" />
    </section>
  )
}
