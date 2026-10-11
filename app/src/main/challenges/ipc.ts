// The challenge steps' IPC, the same for the daily session (daily:*) and checkpoints (checkpoint:*):
// each feature registers them under its prefix, from its own window, on its current round.
//   <prefix>:speak             → SessionAudio: Duet saying the line
//   <prefix>:coach             the learner's recording (WAV) → LineAttempt
//   <prefix>:check-recall      the word picked → { correct, answer, carded }
//   <prefix>:meaning-question  → { question }
//   <prefix>:meaning-check     the learner's answer → { note }
//   <prefix>:produce-check     the learner's own sentence → { note, used }
import type { Handle } from '../ipc/owned'
import type { Round } from './round'

/** The six challenge steps, on whatever round `round` gives (it throws when there is none). */
export function connectRound(handle: Handle, round: () => Round): void {
  handle('speak', () => round().speak())
  handle('coach', (clip) => round().coach(clip))
  handle('check-recall', (choice) => round().checkRecall(choice))
  handle('meaning-question', () => round().meaningQuestion())
  handle('meaning-check', (answer) => round().meaningCheck(answer))
  handle('produce-check', (sentence) => round().produceCheck(sentence))
}
