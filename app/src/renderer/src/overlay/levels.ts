// The level slider's geometry: each level's place along the row, and which level is under the
// pointer. Pure, for tests.
import { AUTO } from '../../../shared/levels'
import type { Level } from '../../../shared/types'

/** Each level's place along the slider: a 24 px circle and a 2 px gap. */
export const LEVEL_SLOT_PX = 26

/** The level under the pointer, `x` px from the row's start (Auto first), kept to Auto–5 past either
 * end. */
export function levelAt(x: number, slot = LEVEL_SLOT_PX): Level {
  return Math.min(5, Math.max(AUTO, Math.floor(x / slot))) as Level
}
