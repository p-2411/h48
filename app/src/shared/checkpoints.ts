// What the strip is shown of checkpoints (src/main/checkpoints keeps the answers).
import type { MeaningView, RecallView, SayView } from './daily'

/** Why a checkpoint is offered: the learner paused, or a scene or conversation ended. */
export type Offer = 'pause' | 'break'

/** One challenge, from the last few minutes of the video. */
export type CheckpointView = (RecallView | MeaningView | ({ kind: 'say' } & SayView)) & { video?: string }
