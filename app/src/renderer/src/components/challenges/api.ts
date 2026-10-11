// What a challenge needs from the main process: the daily session's bridge (window.duet.daily) or a
// checkpoint's (window.duet.checkpoint) both provide it.
import type { ChallengeApi as Steps } from '../../../../shared/daily'

export type ChallengeApi = Steps & {
  /** For a window that leaves the keyboard to the video (the strip): take it, to type an answer. */
  takeKeyboard?(): void
}
