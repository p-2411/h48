// The global shortcut that shows and hides Duet from anywhere. The learner can change it (⚙ on the
// strip); a new one is only kept if the system lets Duet have it.
import { globalShortcut } from 'electron'

export class Shortcut {
  constructor(
    private keys: string,
    private readonly action: () => void
  ) {
    if (!this.register(keys)) console.error(`[duet] could not register ${keys}; another app may be using it`)
  }

  /** Switches to new keys; returns why not, when they can't be had (the old keys stay). */
  change(keys: string): string | undefined {
    if (keys === this.keys) return undefined
    globalShortcut.unregister(this.keys)
    if (this.register(keys)) {
      this.keys = keys
      return undefined
    }
    this.register(this.keys)
    return 'Another app is using those keys. Try a different combination.'
  }

  private register(keys: string): boolean {
    try {
      return globalShortcut.register(keys, this.action)
    } catch {
      return false
    }
  }
}
