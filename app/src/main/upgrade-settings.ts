// Settings are saved whole, so a changed default doesn't reach settings saved before it. Each
// version here brings saved settings up to the defaults of its day, once.
import type { OverlaySettings } from '../shared/types'

/** Brings settings saved under older defaults up to today's. Version 2: "Pause while explaining"
 * is on by default (it was off, and saved settings kept it off). */
export function upgradeSettings(
  saved: Partial<OverlaySettings> | undefined
): Partial<OverlaySettings> | undefined {
  if (!saved || (saved.version ?? 1) >= 2) return saved
  return { ...saved, pauseForHelp: true, version: 2 }
}
