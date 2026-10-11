// Talking to Duet on the strip: the mascot alone (no card behind it) pops up just above the subtitles,
// with small subtitles under it of what it last heard and said, and quiet Text chat and End.
import type { Language } from '../../../shared/languages'
import { Mascot } from '../components/Mascot'
import { VOICE_STATUS, voiceMascotState } from '../explain/voice/status'
import { isVoiceOn, type LiveTutor, type TutorLiveStatus } from '../explain/voice/useLiveTutor'

/** What is happening, when there is nothing said yet to show. */
function waiting(status: TutorLiveStatus): string {
  return `${isVoiceOn(status) ? VOICE_STATUS[status] : VOICE_STATUS.connecting}…`
}

export function TalkBubble({
  live,
  language,
  onText,
  onEnd
}: {
  live: LiveTutor
  language: Language
  onText: () => void
  onEnd: () => void
}): React.JSX.Element {
  const said = [...live.transcripts].reverse()
  const heard = said.find((turn) => turn.role === 'learner' && turn.text.trim())
  const reply = said.find((turn) => turn.role === 'tutor' && turn.text.trim())
  return (
    // Placed above the strip, and opened and closed, by the strip (Overlay.tsx).
    <>
      <Mascot state={voiceMascotState(live.status)} scale={0.3} opening={false} />
      <div className="talk-lines" aria-live="polite">
        {live.error ? (
          <p className="talk-error">{live.error}</p>
        ) : !heard && !reply ? (
          <p className="talk-wait">{waiting(live.status)}</p>
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
          Text chat
        </button>
        <button type="button" className="talk-link" onClick={onEnd}>
          End
        </button>
      </div>
    </>
  )
}
