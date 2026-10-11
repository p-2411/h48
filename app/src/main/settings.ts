// The learner's settings, in one place. Anything that depends on a setting listens for "change"
// rather than being told by whoever changed it. Saved in the local database, so they survive a
// restart; a setting added later simply starts at its default.
import { EventEmitter } from 'events'
import type { OverlaySettings } from '../shared/types'
import { readSetting, writeSetting } from './store/db'

const KEY = 'overlay'

const DEFAULTS: OverlaySettings = { language: 'es', level: 2, guessFirst: true, waitForTranslation: true, pauseForHelp: false, onboarded: false, shortcut: 'Alt+Shift+D' }

export class Settings extends EventEmitter {
  private value: OverlaySettings = { ...DEFAULTS, ...readSetting<Partial<OverlaySettings>>(KEY) }

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
    writeSetting(KEY, this.value)
    this.emit('change', this.value, changed)
  }
}
