// Talking to Duet on the strip: the mascot inside a softly glowing circle pops up above the subtitles,
// with small subtitles under it of what it last heard and said, plus Open chat and microphone mute.
import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Language } from '../../../shared/languages'
import { Mascot } from '../components/Mascot'
import { useTalkMotion } from './useTalkMotion'
import { VOICE_STATUS, voiceMascotState } from '../explain/voice/status'
import { isVoiceOn, type LiveTutor, type TutorLiveStatus } from '../explain/voice/useLiveTutor'

/** What is happening, when there is nothing said yet to show. */
function waiting(status: TutorLiveStatus): string {
  return `${isVoiceOn(status) ? VOICE_STATUS[status] : VOICE_STATUS.connecting}…`
}

export function TalkBubble({
  active,
  live,
  language,
  origin,
  onText
}: {
  active: boolean
  live: LiveTutor
  language: Language
  origin: RefObject<HTMLButtonElement | null>
  onText: () => void
}): React.JSX.Element | null {
  const [present, setPresent] = useState(active)
  // What was said while talking, kept on the bubble as it goes back into the button.
  const [kept, setKept] = useState(live)
  if (active && !present) setPresent(true)
  if (active && live !== kept) setKept(live)
  const bubble = useRef<HTMLDivElement>(null)
  const returned = useCallback(() => setPresent(false), [])
  useTalkMotion(active, present, origin, bubble, returned)
  const shown = active ? live : kept
  const said = [...shown.transcripts].reverse()
  const heard = said.find((turn) => turn.role === 'learner' && turn.text.trim())
  const reply = said.find((turn) => turn.role === 'tutor' && turn.text.trim())
  if (!present) return null
  return (
    <div ref={bubble} className={`talk-bubble${active ? '' : ' closing'}`} data-solid={active || undefined} inert={!active} aria-hidden={!active} role="dialog" aria-label="Talking with Duet">
      <div className="talk-avatar">
        <Mascot state={voiceMascotState(shown.status)} scale={0.26} openingDuration={700} speechAudio={shown.playback} />
      </div>
      <div className="talk-lines" aria-live="polite">
        {shown.error ? (
          <p className="talk-error">{shown.error}</p>
        ) : !heard && !reply ? (
          <p className="talk-wait">{shown.muted ? 'Microphone muted' : waiting(shown.status)}</p>
        ) : (
          <>
            {heard && <p className="talk-heard">{heard.text}</p>}
            {reply && (
              <p className="talk-said" lang={language}>
                {reply.text}
              </p>
            )}
          </>
        )}
      </div>
      <div className="talk-actions">
        {/* Again, keeping what was said so far (Text chat can still take it on). */}
        {live.status === 'error' && live.microphoneBlocked && window.duet.welcome.asksPermissions && (
          <button type="button" className="talk-link" onClick={() => window.duet.welcome.openSettings('microphone')}>
            Open System Settings
          </button>
        )}
        {live.status === 'error' && (
          <button type="button" className="talk-link" onClick={() => void live.start(true)}>
            Try again
          </button>
        )}
        <button type="button" className="talk-link" onClick={onText}>
          Open chat
        </button>
        <button
          type="button"
          className="talk-link"
          onClick={live.toggleMicrophone}
          disabled={!isVoiceOn(shown.status) || shown.status === 'ending'}
          aria-pressed={shown.muted}
          aria-label={shown.muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {shown.muted ? 'Unmute' : 'Mute'}
        </button>
      </div>
    </div>
  )
}
