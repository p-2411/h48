// The daily session's bridge to the main process (src/main/daily).
import type { HomeToday } from '../shared/home'
import type { LineAttempt, SessionAudio, SessionView } from '../shared/daily'
import { invoke } from './invoke'

export const dailyApi = {
  plan: () => invoke<SessionView>('daily:plan'),
  speak: () => invoke<SessionAudio>('daily:speak'),
  /** The learner's recording (WAV) of the line said back. */
  coach: (clip: SessionAudio) => invoke<LineAttempt>('daily:coach', clip),
  checkRecall: (choice: string) => invoke<{ correct: boolean; answer: string }>('daily:check-recall', choice),
  meaningQuestion: () => invoke<{ question: string }>('daily:meaning-question'),
  meaningCheck: (answer: string) => invoke<{ note: string }>('daily:meaning-check', answer),
  done: () => invoke<HomeToday['streak']>('daily:done'),
  /** The daily reminder's time ("19:30"), or null for none. */
  setReminder: (time: string | null) => invoke<void>('daily:set-reminder', time)
}
