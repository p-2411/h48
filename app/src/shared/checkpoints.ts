// What the strip is shown of an open checkpoint (src/main/checkpoints keeps the answers).
import type { SessionView } from './daily'

type Recall = Extract<NonNullable<SessionView['challenge']>, { kind: 'recall' }>
type Meaning = Extract<NonNullable<SessionView['challenge']>, { kind: 'meaning' }>

/** One challenge, from the last few minutes of the video. */
export type CheckpointView = (Recall | Meaning | { kind: 'say'; original: string; translation: string }) & { video?: string }
