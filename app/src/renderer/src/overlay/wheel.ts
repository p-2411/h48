// Turns scrolling (the mouse wheel, or a trackpad swiped up, down or sideways) into steps of one, for
// the strip's level button (LevelNumber.tsx). A trackpad swipe sends many small events and keeps sending them as it coasts,
// so one swipe is one step: after a step, the rest of that swipe is let go. Pure, for tests.

// This much scrolled (in pixels) makes a step.
const STEP_PX = 40
// After a step, scrolling is let go this long, and for this long after each event that keeps coming.
const AFTER_STEP_MS = 250
const COASTING_MS = 120

export class WheelSteps {
  private pending = 0
  private lockedUntil = 0

  /** One scroll event (`deltaY` down, `deltaX` right, at `now` ms): +1 a step on, -1 back, 0 none. */
  step(deltaY: number, deltaX: number, now: number): number {
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
    if (now < this.lockedUntil) {
      this.lockedUntil = Math.max(this.lockedUntil, now + COASTING_MS)
      return 0
    }
    this.pending += delta
    if (Math.abs(this.pending) < STEP_PX) return 0
    const direction = Math.sign(this.pending)
    this.pending = 0
    this.lockedUntil = now + AFTER_STEP_MS
    return direction
  }
}
