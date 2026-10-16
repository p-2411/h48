// Talking to Duet on the strip: the mascot alone (no card behind it) pops up just above the subtitles,
// with small subtitles under it of what it last heard and said, and a quiet row under those: Mute (the
// learner's microphone), the look (dark, or light over a bright picture) and Continue in Duet (the
// same conversation, carried on in writing in the home window), each an icon. The talk ends from Duet's seat on the strip
// (the back arrow, Overlay.tsx).
import type { Language } from '../../../shared/languages'
import { DuetMascot } from '../components/duet/DuetMascot'
import { Icon } from '../components/Icon'
import { VOICE_STATUS } from '../explain/voice/status'
import { useConversationAnimation } from '../components/duet/useConversationAnimation'
import { isConnected, isVoiceOn, type LiveTutor, type TutorLiveStatus } from '../explain/voice/useLiveTutor'

/** Duet and its subtitles over the video: dark (light text) or light (dark ink, for a bright picture). */
export type TalkLook = 'dark' | 'light'

/** What is happening, when there is nothing said yet to show. */
function waiting(status: TutorLiveStatus): string {
  return `${isVoiceOn(status) ? VOICE_STATUS[status] : VOICE_STATUS.connecting}…`
}

export function TalkBubble({
  live,
  language,
  look,
  onLook,
  onText
}: {
  live: LiveTutor
  language: Language
  look: TalkLook
  onLook: (look: TalkLook) => void
  onText: () => void
}): React.JSX.Element {
  const said = [...live.transcripts].reverse()
  const animation = useConversationAnimation({ live })
  const heard = said.find((turn) => turn.role === 'learner' && turn.text.trim())
  const reply = said.find((turn) => turn.role === 'tutor' && turn.text.trim())
  return (
    // Placed above the strip, and opened and closed, by the strip (Overlay.tsx).
    <>
      {/* Wakes up as the bubble opens; its mouth follows Duet's voice. As in the welcome: it watches
          the pointer only when it comes near, never while speaking, when it holds the learner's eyes
          (the engine's speaking gaze). */}
      <DuetMascot
        {...animation}
        width={120}
        wake
        theme={look}
        watch={animation.speaking ? 'off' : 'near'}
        speechAudio={live.playback}
      />
      <div className="talk-lines" aria-live="polite">
        {live.error ? (
          <p className="talk-error">{live.error}</p>
        ) : !heard && !reply ? (
          <p className="talk-wait">{live.muted ? 'You’re muted' : waiting(live.status)}</p>
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
        {/* Again, keeping what was said so far (Continue in Duet can still take it on). */}
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
        <button
          type="button"
          className={`talk-tool${live.muted ? ' on' : ''}`}
          aria-pressed={live.muted}
          disabled={!isConnected(live.status)}
          title={live.muted ? 'Unmute your microphone' : 'Mute your microphone'}
          aria-label={live.muted ? 'Unmute your microphone' : 'Mute your microphone'}
          onClick={live.toggleMicrophone}
        >
          <Icon name={live.muted ? 'mic-off' : 'mic'} />
        </button>
        <button
          type="button"
          className="talk-tool"
          title={look === 'dark' ? 'Dark text, for a bright picture' : 'Light text, for a dark picture'}
          aria-label={look === 'dark' ? 'Use dark text' : 'Use light text'}
          onClick={() => onLook(look === 'dark' ? 'light' : 'dark')}
        >
          <Icon name={look === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button
          type="button"
          className="talk-tool"
          title="Continue in Duet (in writing)"
          aria-label="Continue in Duet, in writing"
          onClick={onText}
        >
          <Icon name="popout" />
        </button>
      </div>
    </>
  )
}
