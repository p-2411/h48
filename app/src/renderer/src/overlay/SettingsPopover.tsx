// The ⚙ popover: the switches worth flipping mid-show, the way to all the settings (in the home base)
// and the way to the whole script. Language, level and keys live in the home base's Settings.
import { motion } from 'motion/react'
import type { OverlaySettings } from '../../../shared/types'
import { pop } from '../components/motion'
import { QuickToggles } from '../components/SettingControls'

export function SettingsPopover({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  return (
    // Opens out of ⚙ (its transform-origin, overlay.css) and goes back into it.
    <motion.div className="settings" data-solid role="dialog" aria-label="Settings" {...pop()}>
      <span className="label">While watching</span>
      <QuickToggles settings={settings} />
      <div className="quiet-row">
        <button type="button" className="quiet" onClick={() => window.duet.openSettings()}>
          More settings
        </button>
        <button type="button" className="quiet" onClick={() => window.duet.showScript()}>
          Open the whole script
        </button>
      </div>
    </motion.div>
  )
}
