// A conversation with Duet, in text or voice: about a line below its explanation (Explain), or free
// (Talk in the home base); `thread` says which one it is in the main process. It is one thread: typed
// messages go to Duet in text; the mic switches to a voice conversation with the same context, and
// when it ends its turns join the thread, so text picks up where voice left off. Card previews
// (save, review) wait for the learner's click or answer; the saved cards are open to Duet in both.
// Explain renders it with the line as its key, so a new line starts a new conversation (and a new
// voice hook). The composer renders into `dock`, the page's slot below its scrolling part; the
// mascot (thinking, listening, speaking) into `mascotSlot`, in the page's top bar.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import type { Language } from '../../../shared/languages'
import { say } from '../components/errors'
import { Mascot, type MascotState } from '../components/Mascot'
import { pop } from '../components/motion'
import { CardPreview, OpenedCard } from './CardPreview'
import { Composer } from './Composer'
import type { ConversationState, ThreadBridge } from './thread'
import { Turn, type TurnData } from './Turn'
import { useCardActions } from './useCardActions'
import { useTurnAids } from './useTurnAids'
import { useEnglishHelp, useVoiceHandoff } from './useVoiceHandoff'
import { VoiceBar } from './VoiceBar'
import { voiceMascotState } from './voice/status'
import { isVoiceOn, useLiveTutor, type TutorLiveStatus } from './voice/useLiveTutor'

// How long the mascot gently corrects after a reply that corrects the learner: one cycle of its
// correction animation (mascot.css).
const CORRECTION_MS = 3_800

/** What the mascot shows: pleased for a moment after a save, gently correcting for a moment after a
 * reply that corrects the learner, else what voice is doing (voice/status.ts), or thinking while a
 * typed reply is on its way. */
function mascotState(
  status: TutorLiveStatus,
  replying: boolean,
  cheering: boolean,
  correcting: boolean
): MascotState {
  if (cheering) return 'success'
  const voice = voiceMascotState(status)
  if (voice !== 'idle') return voice
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
  language,
  thread: bridge,
  dock,
  mascotSlot,
  mascotScale = 0.16,
  free = false,
  startVoice = false
}: {
  state: ConversationState
  language: Language
  thread: ThreadBridge
  dock: HTMLElement | null
  /** Where the mascot goes: the page's top bar, at this times its full size. */
  mascotSlot: HTMLElement | null
  mascotScale?: number
  /** A free conversation (Talk): no line, and the cards open to Duet from the start. */
  free?: boolean
  /** Starts voice as it opens (Talk opened from the hub's mic). */
  startVoice?: boolean
}): React.JSX.Element {
  const live = useLiveTutor(language, free ? 'free' : 'line')
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const cards = useCardActions()
  const endButton = useVoiceHandoff(live, box, bridge.voiceTurns)
  const voiceOn = isVoiceOn(live.status)
  // Voice asked for on opening starts once (not again when StrictMode runs effects twice).
  const voiceStarted = useRef(false)
  useEffect(() => {
    if (!startVoice || voiceStarted.current) return
    voiceStarted.current = true
    void bridge.claim().catch(() => undefined).then(() => live.start())
  }, [startVoice, bridge, live])

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

  return (
    <section className="conversation" aria-label="Conversation with Duet">
      {/* New turns rise in; those there when it opens, and voice turns joining the thread after voice
          (they were shown as they were spoken), don't. */}
      <AnimatePresence initial={false}>
      {thread.map((turn, index) => (
        <Turn
          key={turn.id}
          enter={!(turn.via === 'voice' && turn.id.startsWith('c'))}
          id={turn.id}
          from={turn.from}
          text={turn.text}
          via={turn.via}
          tail={turn.from === 'duet' && thread[index + 1]?.from !== 'duet'}
          language={language}
          revealed={aids.revealed.has(turn.id)}
          meaning={aids.meanings[turn.id]}
          reading={aids.readings[turn.id]}
          onReveal={aids.reveal}
          onHide={aids.hide}
        />
      ))}
      </AnimatePresence>

      {/* A card opened or offered pops in, and out when it's done. */}
      <AnimatePresence>
        {cards.card && (
          <motion.div key={`card:${cards.card.id}`} {...pop()}>
            <OpenedCard card={cards.card} onClose={cards.closeCard} />
          </motion.div>
        )}
        {cards.pending && (
          <motion.div key={`pending:${cards.pending.id}`} {...pop()}>
            <CardPreview
              pending={cards.pending}
              language={language}
              voiceOn={voiceOn}
              busy={cards.busy}
              onConfirm={cards.confirm}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
                onClick={() => bridge.ask(unanswered)}
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
                <button type="button" className="btn quiet" onClick={() => void bridge.claim().catch(() => undefined).then(() => live.start())}>
                  Try voice again
                </button>
              </>
            )}
          </div>
        )}
        {cards.actionError && <p className="notice error">{cards.actionError}</p>}
      </div>

      {mascotSlot &&
        createPortal(
          <div className="head-mascot">
            <Mascot
              state={mascotState(live.status, !!state.replying || !!state.loading, cards.cheering, correcting)}
              scale={mascotScale}
              speechAudio={live.playback}
            />
          </div>,
          mascotSlot
        )}
      {dock &&
        createPortal(
          <div className="composer">
            {isVoiceOn(live.status) ? (
              <VoiceBar live={live} status={live.status} endButton={endButton} />
            ) : (
              <Composer
                box={box}
                draft={draft}
                onDraft={setDraft}
                language={language}
                replying={!!state.replying}
                onStartVoice={() => void bridge.claim().catch(() => undefined).then(() => live.start())}
                onSend={bridge.ask}
                free={free}
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
