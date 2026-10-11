// Wait for translation: when the line on screen is still being translated, the video is held
// until it is ready. Pressing play while Duet waits plays through that line without waiting again.
import type { OverlayLine } from '../shared/types'
import type { Player } from './player'
import type { Settings } from './settings'

export class WaitForTranslation {
  private waitingFor?: number
  private playedThrough?: number

  constructor(
    private player: Player,
    private settings: Settings,
    private currentLine: () => OverlayLine | undefined
  ) {
    player.on('overridden', (holder) => {
      if (holder !== 'wait') return
      this.playedThrough = this.waitingFor
      this.waitingFor = undefined
    })
  }

  /** Call often: holds or releases the video as the line on screen changes. */
  tick(): void {
    const line = this.currentLine()
    const pending = line?.state === 'pending' && this.settings.current.waitForTranslation ? line : undefined
    if (this.waitingFor !== undefined) {
      // Still waiting, possibly for a different line now (after a seek or a language switch).
      if (pending) this.waitingFor = pending.id
      else {
        this.waitingFor = undefined
        this.player.release('wait')
      }
      return
    }
    if (pending && pending.id !== this.playedThrough && this.player.playing) {
      this.waitingFor = pending.id
      this.player.hold('wait')
    }
  }
}
