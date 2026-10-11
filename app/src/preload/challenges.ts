// The challenge steps' bridge, the same for the daily session (daily:*) and checkpoints
// (checkpoint:*): src/main/challenges/ipc.ts.
import type { ChallengeApi, LineAttempt, RecallResult, SessionAudio } from '../shared/daily'
import { invoke } from './invoke'

export function challengeBridge(prefix: 'daily' | 'checkpoint'): ChallengeApi {
  return {
    speak: () => invoke<SessionAudio>(`${prefix}:speak`),
    coach: (clip) => invoke<LineAttempt>(`${prefix}:coach`, clip),
    checkRecall: (choice) => invoke<RecallResult>(`${prefix}:check-recall`, choice),
    meaningQuestion: () => invoke<{ question: string }>(`${prefix}:meaning-question`),
    meaningCheck: (answer) => invoke<{ note: string }>(`${prefix}:meaning-check`, answer),
    produceCheck: (sentence) => invoke<{ note: string; used: string[] }>(`${prefix}:produce-check`, sentence)
  }
}
