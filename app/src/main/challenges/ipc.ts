// The challenge steps' IPC, the same for the daily session (daily:*) and checkpoints (checkpoint:*):
// each feature registers them under its prefix, from its own window, on its current round.
//   <prefix>:speak             → SessionAudio: Duet saying the line
//   <prefix>:coach             the learner's recording (WAV) → LineAttempt
//   <prefix>:check-recall      the word picked → { correct, answer, carded }
//   <prefix>:meaning-question  → { question }
//   <prefix>:meaning-check     the learner's answer → { note }
import { ipcMain, type WebContents } from 'electron'
import type { Round } from './round'

export type Handle = (channel: string, work: (...args: unknown[]) => unknown) => void

/** Registers `<prefix>:<channel>` handlers that only `owns`'s window may call; others get `refusal`. */
export function ownedHandler(prefix: string, owns: (sender: WebContents) => boolean, refusal: string): Handle {
  return (channel, work) =>
    ipcMain.handle(`${prefix}:${channel}`, (event, ...args) => {
      if (!owns(event.sender)) throw new Error(refusal)
      return work(...args)
    })
}

/** The five challenge steps, on whatever round `round` gives (it throws when there is none). */
export function connectRound(handle: Handle, round: () => Round): void {
  handle('speak', () => round().speak())
  handle('coach', (clip) => round().coach(clip))
  handle('check-recall', (choice) => round().checkRecall(choice))
  handle('meaning-question', () => round().meaningQuestion())
  handle('meaning-check', (answer) => round().meaningCheck(answer))
}
