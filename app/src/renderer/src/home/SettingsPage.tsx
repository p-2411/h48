// Settings: everything Duet can be set to, in one page. The strip's ⚙ keeps the quick switches (the
// same controls, SettingControls.tsx); review settings stay with Review.
import { useCallback, useEffect, useState } from 'react'
import { languageName, languageModule } from '../../../shared/languages'
import { mixedLine } from '../../../shared/levels'
import { Words } from '../components/Words'
import type { OverlaySettings } from '../../../shared/types'
import type { Appearance } from '../../../shared/workspace'
import { say } from '../components/errors'
import {
  LanguagePicker,
  LevelPicker,
  QuickToggles,
  ShortcutRecorder,
  Toggle
} from '../components/SettingControls'
import { LoadState } from '../components/LoadState'

// The reminder's time when it is first turned on.
const DEFAULT_REMINDER = '19:00'

/** The daily reminder: on or off, and at what time. Off by default. */
function ReminderSetting({ time }: { time?: string }): React.JSX.Element {
  const [error, setError] = useState<string>()
  const save = (next: string | null): void => {
    setError(undefined)
    window.duet
      .setReminder(next)
      .catch((cause) => setError(say(cause, 'Could not save the reminder.')))
  }
  return (
    <>
      <Toggle
        on={!!time}
        label="Remind me each day"
        hint="A notification when today’s session isn’t done yet"
        onChange={(on) => save(on ? DEFAULT_REMINDER : null)}
      />
      {time && (
        <label className="field">
          <span className="muted">At</span>
          <input
            type="time"
            aria-label="Reminder time"
            value={time}
            onChange={(event) => event.target.value && save(event.target.value)}
          />
        </label>
      )}
      {error && (
        <small className="error-text" role="alert">
          {error}
        </small>
      )}
    </>
  )
}

export function SettingsPage({
  appearance = 'light',
  onAppearance
}: {
  appearance?: Appearance
  onAppearance?: (appearance: Appearance) => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<OverlaySettings>()
  const [error, setError] = useState<string>()
  const load = useCallback(() => {
    window.duet.getState().then(
      (state) => {
        setSettings(state.settings)
        setError(undefined)
      },
      (cause) => setError(say(cause, 'Could not load the settings.'))
    )
  }, [])
  useEffect(() => {
    load()
    return window.duet.onSettings(setSettings)
  }, [load])
  return (
    <main className="home-page home-settings">
      <h1>Settings</h1>
      <p className="set-lede serif">Make Duet yours.</p>
      {!settings ? (
        <LoadState loaded={false} error={error} reload={load} />
      ) : (
        <>
          <section className="settings-group" aria-labelledby="settings-learning">
            <h2 className="label" id="settings-learning">
              Learning
            </h2>
            <div className="glass">
              <LanguagePicker settings={settings} />
              <span className="muted">How much {languageName(settings.language)} in each line</span>
              <div className="home-level-picker">
                <LevelPicker settings={settings} numbered />
              </div>
              <div className="settings-preview" aria-label="Example subtitle at this level">
                <Words
                  tokens={mixedLine(languageModule(settings.language).sample, settings.level)}
                  script={settings.wordScript}
                />
              </div>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="settings-watching">
            <h2 className="label" id="settings-watching">
              While watching
            </h2>
            <div className="glass">
              <QuickToggles settings={settings} />
            </div>
          </section>
          <section className="settings-group" aria-labelledby="settings-look">
            <h2 className="label" id="settings-look">
              Look
            </h2>
            <div className="seg" role="group" aria-label="Appearance">
              {(['light', 'dark', 'system'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={appearance === value}
                  className={appearance === value ? 'selected' : ''}
                  onClick={() => onAppearance?.(value)}
                >
                  {value === 'system'
                    ? `Match ${navigator.platform.includes('Mac') ? 'Mac' : 'Windows'}`
                    : value === 'light'
                      ? 'Light'
                      : 'Dark'}
                </button>
              ))}
            </div>
          </section>
          <section className="settings-group" aria-labelledby="settings-reminder">
            <h2 className="label" id="settings-reminder">
              Daily reminder
            </h2>
            <div className="glass">
              <ReminderSetting time={settings.reminder} />
            </div>
          </section>
          <section className="settings-group" aria-labelledby="settings-keys">
            <h2 className="label" id="settings-keys">
              Keys
            </h2>
            <div className="glass">
              <ShortcutRecorder keys={settings.shortcut} />
              <ShortcutRecorder keys={settings.talkShortcut} kind="talk" />
            </div>
          </section>
          {window.duet.welcome.asksPermissions && (
            <section className="settings-group" aria-labelledby="settings-permissions">
              <h2 className="label" id="settings-permissions">
                Permissions
              </h2>
              <div className="glass">
                <p className="muted">
                  Duet needs Accessibility to read captions, and System Audio Recording to hear
                  videos.
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => window.duet.welcome.openSettings('accessibility')}
                  >
                    Accessibility…
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => window.duet.welcome.openSettings('audio')}
                  >
                    System Audio Recording…
                  </button>
                </div>
              </div>
            </section>
          )}
          <section className="settings-group" aria-labelledby="settings-demo">
            <h2 className="label" id="settings-demo">
              Demo
            </h2>
            <div className="glass">
              <p className="muted">
                Meet Duet again. Nothing you pick in it changes your settings.
              </p>
              <button type="button" className="btn" onClick={() => window.duet.home.openWelcome()}>
                Replay the demo
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
