// Settings: everything Duet can be set to, in one page. The strip's ⚙ keeps the quick switches (the
// same controls, SettingControls.tsx); review settings stay with Review.
import { useCallback, useEffect, useState } from 'react'
import { languageName } from '../../../shared/languages'
import type { OverlaySettings } from '../../../shared/types'
import { updateLine, type UpdateStatus } from '../../../shared/updates'
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
    window.duet.setReminder(next).catch((cause) => setError(say(cause, 'Could not save the reminder.')))
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
          <input type="time" aria-label="Reminder time" value={time} onChange={(event) => event.target.value && save(event.target.value)} />
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

/** Duet's version, and its updates: found and downloaded on their own, installed on quit or at once. */
function UpdatesSetting(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>()
  useEffect(() => {
    // Without an answer the version is unknown, and the section isn't shown.
    window.duet.updates.get().then(setStatus, () => {})
    return window.duet.updates.onChanged(setStatus)
  }, [])
  if (!status) return null
  const { state } = status
  return (
    <section className="settings-group" aria-labelledby="settings-updates">
      <h2 className="label" id="settings-updates">
        Updates
      </h2>
      <div className="glass">
        <p className="muted">
          {/* Only a change of state is read aloud, not each percent of a download. */}
          <span role="status">
            Duet {status.version}. {updateLine(state)}
          </span>
          {state.kind === 'downloading' && ` ${Math.floor(state.percent)}%`}
        </p>
        {state.kind === 'ready' ? (
          <button type="button" className="btn" onClick={() => window.duet.updates.restart()}>
            Restart to update
          </button>
        ) : (
          (state.kind === 'idle' || state.kind === 'failed') && (
            <button type="button" className="btn" onClick={() => window.duet.updates.check()}>
              Check for updates
            </button>
          )
        )}
      </div>
    </section>
  )
}

export function SettingsPage(): React.JSX.Element {
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
              <LevelPicker settings={settings} />
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
          <section className="settings-group" aria-labelledby="settings-permissions">
            <h2 className="label" id="settings-permissions">
              Permissions
            </h2>
            <div className="glass">
              <p className="muted">
                Duet needs Accessibility to read captions, and System Audio Recording to hear videos.
              </p>
              <button type="button" className="btn" onClick={() => window.duet.home.openWelcome()}>
                Welcome and permissions…
              </button>
            </div>
          </section>
          <UpdatesSetting />
        </>
      )}
    </main>
  )
}
