// The strip's bridge to checkpoints (src/main/checkpoints).
import { ipcRenderer } from 'electron'
import type { CheckpointView } from '../shared/checkpoints'
import type { LineAttempt, SessionAudio } from '../shared/daily'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const checkpointApi = {
  /** A checkpoint is offered ('pause' or 'break': the strip glows), or not (null). */
  onOffer: (listener: (offer: 'pause' | 'break' | null) => void) => subscribe('checkpoint:offer', listener),
  open: () => invoke<CheckpointView>('checkpoint:open'),
  speak: () => invoke<SessionAudio>('checkpoint:speak'),
  coach: (clip: SessionAudio) => invoke<LineAttempt>('checkpoint:coach', clip),
  checkRecall: (choice: string) => invoke<{ correct: boolean; answer: string }>('checkpoint:check-recall', choice),
  meaningQuestion: () => invoke<{ question: string }>('checkpoint:meaning-question'),
  meaningCheck: (answer: string) => invoke<{ note: string }>('checkpoint:meaning-check', answer),
  done: () => invoke<void>('checkpoint:done'),
  close: () => invoke<void>('checkpoint:close'),
  /** The strip takes the keyboard (it normally leaves it to the video), to type an answer. */
  takeKeyboard: () => ipcRenderer.send('duet:focus')
}
