// The learner's settings, in one place. Anything that depends on a setting listens for "change"
// rather than being told by whoever changed it. Kept in memory for now; saving them is a later step.
import { EventEmitter } from 'events'
import type { OverlaySettings } from '../shared/types'

const DEFAULTS: OverlaySettings = { language: 'es', level: 2, guessFirst: true, waitForTranslation: true }

export class Settings extends EventEmitter {
  private value: OverlaySettings = { ...DEFAULTS }

  get current(): OverlaySettings {
    return this.value
  }

  /** Emits "change" with the new settings and only the fields that changed. */
  update(change: Partial<OverlaySettings>): void {
    const changed = Object.fromEntries(
      Object.entries(change).filter(([key, value]) => this.value[key as keyof OverlaySettings] !== value)
    ) as Partial<OverlaySettings>
    if (!Object.keys(changed).length) return
    this.value = { ...this.value, ...changed }
    this.emit('change', this.value, changed)
  }
}
