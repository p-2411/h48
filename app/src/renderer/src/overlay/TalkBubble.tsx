// Talking to Duet on the strip: the mascot alone (no card behind it) pops up just above the subtitles,
// with small subtitles under it of what it last heard and said, and quiet Text chat and End.
import type { Language } from '../../../shared/languages'
import { Mascot, type MascotState } from '../components/Mascot'
import type { LiveTutor, TutorLiveStatus } from '../explain/voice/useLiveTutor'

function mascotState(status: TutorLiveStatus): MascotState {
  if (status === 'listening') return 'listening'
  if (status === 'speaking') return 'speaking'
  if (status === 'idle' || status === 'ended' || status === 'error') return 'idle'
  return 'thinking'
}

/** What is happening, when there is nothing said yet to show. */
function waiting(status: TutorLiveStatus): string {
  if (status === 'requesting-microphone') return 'Asking for the microphone…'
  if (status === 'connecting' || status === 'idle') return 'Connecting…'
  if (status === 'reconnecting') return 'Reconnecting…'
  return 'Listening…'
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
    <div className="talk-bubble" data-solid role="dialog" aria-label="Talking with Duet">
      <Mascot state={mascotState(live.status)} scale={0.3} opening={false} />
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
        {live.status === 'error' && (
          <button type="button" className="talk-link" onClick={() => void live.start()}>
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
    </div>
  )
}
