// The controls for Duet's settings, in the home base's Settings; the quick toggles are on the strip's
// ⚙ too, so they look and work the same in both. Styles: settings.css.
import { useEffect, useState } from 'react'
import { LANGUAGE_CODES, languageModule, languageName } from '../../../shared/languages'
import type { OverlaySettings, ShortcutKind } from '../../../shared/types'
import { accelerator, symbols } from '../overlay/keys'
import { LEVELS } from '../overlay/words'
import { say } from './errors'
import './settings.css'

export function Toggle({
  on,
  label,
  hint,
  onChange
}: {
  on: boolean
  label: string
  hint: string
  onChange: (on: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
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

/** The switches worth flipping mid-show: what the strip's ⚙ keeps. */
export function QuickToggles({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  const { name, reading } = languageModule(settings.language)
  return (
    <>
      <Toggle
        on={settings.showFullLine}
        label={`Show the whole ${name} line`}
        hint="Under the mixed line, when you hover the strip"
        onChange={window.duet.setShowFullLine}
      />
      {reading && (
        <Toggle
          on={settings.wordScript === 'reading'}
          label={`${name} words in Latin letters`}
          hint={`As they sound (${reading.name}), not in ${name} script`}
          onChange={(on) => window.duet.setWordScript(on ? 'reading' : 'native')}
        />
      )}
      <Toggle
        on={settings.guessFirst}
        label="Hide English until I look"
        hint="Hover the English to see it"
        onChange={window.duet.setGuessFirst}
      />
      <Toggle
        on={settings.waitForTranslation}
        label="Pause for slow translations"
        hint="Only on videos with a transcript"
        onChange={window.duet.setWaitForTranslation}
      />
      <Toggle
        on={settings.pauseForHelp}
        label="Pause while explaining"
        hint="While the Explain panel is open"
        onChange={window.duet.setPauseForHelp}
      />
      <Toggle
        on={settings.checkpoints === true}
        label="Checkpoints"
        hint="A glow on the strip at a pause or a break: one quick challenge"
        onChange={window.duet.setCheckpoints}
      />
    </>
  )
}

export function LanguagePicker({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  return (
    <div className="segment" role="group" aria-label="Language">
      {LANGUAGE_CODES.map((language) => (
        <button
          key={language}
          type="button"
          aria-pressed={settings.language === language}
          onClick={() => window.duet.setLanguage(language)}
        >
          {languageName(language)}
        </button>
      ))}
    </div>
  )
}

export function LevelPicker({ settings, numbered = false }: { settings: OverlaySettings; numbered?: boolean }): React.JSX.Element {
  return (
    <div className="segment" role="group" aria-label="Level">
      {LEVELS.map((item) => (
        <button
          key={item.level}
          type="button"
          aria-pressed={settings.level === item.level}
          onClick={() => window.duet.setLevel(item.level)}
        >
          {numbered && item.level > 0 ? item.level : item.name}
        </button>
      ))}
    </div>
  )
}

/** One of Duet's global keys (show or hide it, or talk to it): click, then press the new ones (Esc
 * keeps the old). */
export function ShortcutRecorder({ keys, kind = 'show' }: { keys: string; kind?: ShortcutKind }): React.JSX.Element {
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
      try {
        setError(await window.duet.setShortcut(next, kind))
      } catch (error) {
        setError(say(error, 'Could not change the keys. Try another combination.'))
      }
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  }, [recording, kind])
  const label = kind === 'talk' ? 'Talk to Duet' : 'Show or hide Duet'
  return (
    <>
      <div className="toggle">
        <span>
          {label}
          <small>{recording ? 'Press the new keys · Esc to keep' : 'Click to change'}</small>
        </span>
        <button
          type="button"
          className={`keys${recording ? ' on' : ''}`}
          aria-label={recording ? `${label}: press the new keys, or Esc to keep ${symbols(keys)}` : `${label}: ${symbols(keys)}. Change`}
          onClick={() => {
            setError(undefined)
            setRecording(!recording)
          }}
        >
          {recording ? '…' : symbols(keys)}
        </button>
      </div>
      {error && (
        <small className="error-text" role="alert">
          {error}
        </small>
      )}
    </>
  )
}
