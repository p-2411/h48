// The learner's settings, in one place. Anything that depends on a setting listens for "change"
// rather than being told by whoever changed it. Saved in the local database, so they survive a
// restart; a setting added later simply starts at its default.
import { EventEmitter } from 'events'
import type { OverlaySettings } from '../shared/types'
import { database } from './store/db'

const KEY = 'overlay'

const DEFAULTS: OverlaySettings = { language: 'es', level: 2, guessFirst: true, waitForTranslation: true }

export class Settings extends EventEmitter {
  private value: OverlaySettings = { ...DEFAULTS, ...load() }

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
    database().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(this.value))
    this.emit('change', this.value, changed)
  }
}

function load(): Partial<OverlaySettings> {
  const row = database().prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined
  try {
    return row ? JSON.parse(row.value) : {}
  } catch {
    return {}
  }
}
