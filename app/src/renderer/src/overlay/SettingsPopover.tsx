// The ⚙ popover: what changes once in a while (language, how much of it, the pauses, the keys
// that show and hide Duet), kept off the strip, and the way to the whole script.
import { useEffect, useState } from 'react'
import { LANGUAGE_CODES, languageName } from '../../../shared/languages'
import type { OverlaySettings } from '../../../shared/types'
import { accelerator, symbols } from './keys'
import { LEVELS } from './words'

function Toggle({ on, label, hint, onChange }: { on: boolean; label: string; hint: string; onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <button type="button" className={`toggle${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onChange(!on)}>
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <span className="switch" aria-hidden="true">
        <i />
      </span>
    </button>
  )
}

/** The show/hide keys: click, then press the new ones (Esc keeps the old). */
function ShortcutRecorder({ keys }: { keys: string }): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!recording) return
    const press = async (event: KeyboardEvent): Promise<void> => {
      event.preventDefault()
      if (event.key === 'Escape') return setRecording(false)
      const next = accelerator(event)
      if (!next) return
      setRecording(false)
      setError(await window.duet.setShortcut(next))
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  }, [recording])
  return (
    <>
      <div className="toggle">
        <span>
          Show or hide Duet
          <small>{recording ? 'Press the new keys · Esc to keep' : 'Click to change'}</small>
        </span>
        <button
          type="button"
          className={`keys${recording ? ' on' : ''}`}
          onClick={() => {
            setError(undefined)
            setRecording(!recording)
            if (!recording) window.duet.focus()
          }}
        >
          {recording ? '…' : symbols(keys)}
        </button>
      </div>
      {error && <small className="error-text">{error}</small>}
    </>
  )
}

export function SettingsPopover({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  return (
    <div className="settings" data-solid role="dialog" aria-label="Settings">
      <span className="label">Learning</span>
      <div className="segment" role="group" aria-label="Language">
        {LANGUAGE_CODES.map((language) => (
          <button key={language} type="button" aria-pressed={settings.language === language} onClick={() => window.duet.setLanguage(language)}>
            {languageName(language)}
          </button>
        ))}
      </div>
      <span className="label">How much {languageName(settings.language)} in each line</span>
      <div className="segment" role="group" aria-label="Level">
        {LEVELS.map((item) => (
          <button key={item.level} type="button" aria-pressed={settings.level === item.level} onClick={() => window.duet.setLevel(item.level)}>
            {item.name}
          </button>
        ))}
      </div>
      <Toggle on={settings.guessFirst} label="Hide English until I look" hint="Hover the English to see it" onChange={window.duet.setGuessFirst} />
      <Toggle
        on={settings.waitForTranslation}
        label="Pause for slow translations"
        hint="Only on videos with a transcript"
        onChange={window.duet.setWaitForTranslation}
      />
      <Toggle on={settings.pauseForHelp} label="Pause while explaining" hint="While the Explain panel is open" onChange={window.duet.setPauseForHelp} />
      <ShortcutRecorder keys={settings.shortcut} />
      <button type="button" className="quiet" onClick={() => window.duet.showScript()}>
        Open the whole script
      </button>
    </div>
  )
}
