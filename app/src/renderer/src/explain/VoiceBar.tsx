// Voice: what it is doing, and its controls, in place of the message box while it is on.
import type { Ref } from 'react'
import { isConnected, type LiveTutor, type VoiceOnStatus } from './voice/useLiveTutor'

// Only the statuses voice can be in while this bar shows.
const STATUS: Record<VoiceOnStatus, string> = {
  'requesting-microphone': 'Opening the microphone',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  listening: 'Listening',
  speaking: 'Speaking',
  working: 'Checking that',
  ending: 'Ending'
}

export function VoiceBar({
  live,
  status,
  endButton
}: {
  live: LiveTutor
  status: VoiceOnStatus
  endButton: Ref<HTMLButtonElement>
}): React.JSX.Element {
  const connected = isConnected(status)
  return (
    <div className="voice-bar">
      <span className={`voice-state ${status}`}>
        <i aria-hidden="true" /> {STATUS[status]}
        {live.usageSeconds > 0 && <span className="faint"> · {Math.ceil(live.usageSeconds)}s</span>}
      </span>
      <span className="spacer" />
      <button
        type="button"
        className="btn quiet"
        onClick={live.toggleMicrophone}
        disabled={!connected}
      >
        {live.muted ? 'Unmute mic' : 'Mute mic'}
      </button>
      <button
        type="button"
        className="btn quiet"
        onClick={live.speakerBlocked ? live.retryTutorAudio : live.toggleTutorAudio}
        disabled={!connected}
      >
        {live.tutorMuted || live.speakerBlocked ? 'Hear Duet' : 'Mute Duet'}
      </button>
      <button
        type="button"
        className="btn quiet"
        onClick={live.requestPronunciationCheck}
        disabled={!connected}
      >
        Check my pronunciation
      </button>
      <button
        ref={endButton}
        type="button"
        className="btn primary"
        onClick={live.end}
        disabled={status === 'ending'}
      >
        End voice
      </button>
    </div>
  )
}
