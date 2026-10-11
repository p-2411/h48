// Settings: everything Duet can be set to, in one page. The strip's ⚙ keeps the quick switches (the
// same controls, SettingControls.tsx); review settings stay with Review.
import { useEffect, useState } from 'react'
import { languageName } from '../../../shared/languages'
import type { OverlaySettings } from '../../../shared/types'
import { say } from '../components/errors'
import {
  LanguagePicker,
  LevelPicker,
  QuickToggles,
  ShortcutRecorder
} from '../components/SettingControls'

export function SettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<OverlaySettings>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    window.duet.getState().then(
      (state) => setSettings(state.settings),
      (cause) => setError(say(cause, 'Could not load the settings.'))
    )
    return window.duet.onSettings(setSettings)
  }, [])
  return (
    <main className="home-page home-settings">
      <h1>Settings</h1>
      {error && !settings && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!settings ? (
        !error && (
          <p className="faint" role="status">
            Loading…
          </p>
        )
      ) : (
        <>
          <section className="card-box" aria-labelledby="settings-learning">
            <h2 className="label" id="settings-learning">
              Learning
            </h2>
            <LanguagePicker settings={settings} />
            <span className="muted">How much {languageName(settings.language)} in each line</span>
            <LevelPicker settings={settings} />
          </section>
          <section className="card-box" aria-labelledby="settings-watching">
            <h2 className="label" id="settings-watching">
              While watching
            </h2>
            <QuickToggles settings={settings} />
          </section>
          <section className="card-box" aria-labelledby="settings-keys">
            <h2 className="label" id="settings-keys">
              Keys
            </h2>
            <ShortcutRecorder keys={settings.shortcut} />
          </section>
          <section className="card-box" aria-labelledby="settings-permissions">
            <h2 className="label" id="settings-permissions">
              Permissions
            </h2>
            <p className="muted">
              Duet needs Accessibility to read captions, and System Audio Recording to hear videos.
            </p>
            <button type="button" className="btn" onClick={() => window.duet.home.openWelcome()}>
              Welcome and permissions…
            </button>
          </section>
        </>
      )}
    </main>
  )
}
