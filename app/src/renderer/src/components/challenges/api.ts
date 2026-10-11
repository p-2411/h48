// What a challenge needs from the main process: the daily session's bridge (window.duet.daily) or a
// checkpoint's (window.duet.checkpoint) both provide it.
import type { LineAttempt, SessionAudio } from '../../../../shared/daily'

export type ChallengeApi = {
  speak(): Promise<SessionAudio>
  coach(clip: SessionAudio): Promise<LineAttempt>
  checkRecall(choice: string): Promise<{ correct: boolean; answer: string }>
  meaningQuestion(): Promise<{ question: string }>
  meaningCheck(answer: string): Promise<{ note: string }>
  /** For a window that leaves the keyboard to the video (the strip): take it, to type an answer. */
  takeKeyboard?(): void
}
