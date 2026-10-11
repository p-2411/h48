// The level slider's geometry: each level's place along the row, and which level is under the
// pointer. Pure, for tests.
import { AUTO, MAX_LEVEL } from '../../../shared/levels'
import type { Level } from '../../../shared/types'

/** Each level's place along the slider: a 24 px circle and a 2 px gap. */
export const LEVEL_SLOT_PX = 26

/** The level under the pointer, `x` px from the row's start (Auto first), kept to Auto–5 past either
 * end. */
export function levelAt(x: number, slot = LEVEL_SLOT_PX): Level {
  return Math.min(MAX_LEVEL, Math.max(AUTO, Math.floor(x / slot))) as Level
}

// A level asked for that the settings haven't answered after this long is taken as lost.
const ANSWER_MS = 1_000

/** The level the strip is on, one step at a time: each step starts from the last level asked for,
 * not from the settings, which take a beat to come back, so quick swipes (or arrow presses) add up
 * and an answer to an earlier step doesn't pull the next one back. A level the settings report that
 * nothing here asked for (set in Settings, say) is taken once nothing is on its way. */
export class LevelSteps {
  private current: Level
  // Levels asked for and not answered yet, oldest first.
  private sent: { level: Level; at: number }[] = []

  constructor(level: Level) {
    this.current = level
  }

  /** The level asked for last (or reported, once the settings have caught up). */
  get target(): Level {
    return this.current
  }

  /** One level on (1) or back (-1): where it lands, and whether it moved (at either end it can't). */
  step(direction: number, now: number): { next: Level; moved: boolean } {
    const next = Math.min(MAX_LEVEL, Math.max(AUTO, this.current + Math.sign(direction))) as Level
    const moved = next !== this.current
    if (moved) this.ask(next, now)
    return { next, moved }
  }

  /** A level picked directly (on the open row). */
  set(level: Level, now: number): Level {
    if (level !== this.current) this.ask(level, now)
    return level
  }

  /** What the settings say the level is now. */
  heard(level: Level, now: number): void {
    this.sent = this.sent.filter((item) => now - item.at < ANSWER_MS)
    const answered = this.sent.findIndex((item) => item.level === level)
    if (answered >= 0) this.sent = this.sent.slice(answered + 1)
    if (!this.sent.length) this.current = level
  }

  private ask(level: Level, now: number): void {
    this.current = level
    this.sent.push({ level, at: now })
  }
}
