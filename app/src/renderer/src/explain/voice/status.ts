// What voice is doing, in the learner's words, and the mascot's face for it: the same in the panel's
// voice bar, Talk and the strip's talk bubble.
import type { MascotState } from '../../components/Mascot'
import type { TutorLiveStatus, VoiceOnStatus } from './useLiveTutor'

/** Each status voice can be in while it is on, as the voice bar and the talk bubble say it. */
export const VOICE_STATUS: Record<VoiceOnStatus, string> = {
  'requesting-microphone': 'Opening the microphone',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  listening: 'Listening',
  speaking: 'Speaking',
  working: 'Checking that',
  ending: 'Ending'
}

/** The mascot for what voice is doing: listening, speaking, thinking while it connects or works,
 * else idle (off, ending, ended, failed). */
export function voiceMascotState(status: TutorLiveStatus): MascotState {
  if (status === 'listening') return 'listening'
  if (status === 'speaking') return 'speaking'
  if (status === 'requesting-microphone' || status === 'connecting' || status === 'reconnecting' || status === 'working') return 'thinking'
  return 'idle'
}
