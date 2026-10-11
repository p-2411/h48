// The overlay's top bar: the status, and the language, level and toggles. Dragging it moves the window.
import { LANGUAGES, type Language, type Level, type OverlaySettings, type OverlayStatus } from '../../../shared/types'

const LEVELS: Level[] = [1, 2, 3, 4, 5]

function statusText(status: OverlayStatus, language: Language): string {
  if (status.error) return status.error
  if (!status.trusted) return 'Needs Accessibility permission'
  if (!status.url) return `Open a YouTube or Netflix video with ${LANGUAGES[language]} captions`
  const browser = status.browser ?? 'your browser'
  // With the video's transcript, the captions in the player don't matter.
  if (status.source === 'transcript') return `Following the transcript in ${browser}`
  // No transcript and no captions: Duet transcribes what it hears.
  if (status.source === 'audio') return `Listening to the video in ${browser}`
  if (status.available === false) return 'This video has no captions. Try another video'
  if (!status.captions) return 'Turn on captions in the player'
  return `Reading ${status.siteName ?? 'the video'} in ${browser}`
}

function Toggle({ on, label, title, onChange }: { on: boolean; label: string; title?: string; onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <button type="button" className={`toggle${on ? ' is-on' : ''}`} aria-pressed={on} title={title} onClick={() => onChange(!on)}>
      <span className="switch" aria-hidden="true">
        <i />
      </span>
      {label}
    </button>
  )
}

export function Bar({ settings, status, hasLine }: { settings: OverlaySettings; status: OverlayStatus; hasLine: boolean }): React.JSX.Element {
  return (
    <header className="bar">
      <div className="brand">
        <svg viewBox="0 0 30 24" width="22" height="18" aria-hidden="true">
          <rect x="1" y="2" width="17" height="12" rx="4" fill="#fff" />
          <rect x="10" y="9" width="19" height="13" rx="4" fill="#fff" stroke="#121214" strokeWidth="2" />
        </svg>
        <span className={`status${status.trusted && (status.captions || status.source === 'transcript') ? ' is-on' : ''}`}>
          <i aria-hidden="true" />
          {statusText(status, settings.language)}
        </span>
      </div>
      <div className="controls">
        <button type="button" className="action" disabled={!status.url} title="Every line of the video" onClick={() => window.duet.showScript()}>
          Script
        </button>
        <button type="button" className="action" disabled={!hasLine} title="Explain the line on screen" onClick={() => window.duet.explainLine()}>
          Explain
        </button>
        <div className="segment" role="group" aria-label="Language">
          {(Object.keys(LANGUAGES) as Language[]).map((language) => (
            <button
              key={language}
              type="button"
              aria-pressed={settings.language === language}
              title={LANGUAGES[language]}
              onClick={() => window.duet.setLanguage(language)}
            >
              {language.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="segment" role="group" aria-label="Level">
          {LEVELS.map((level) => (
            <button key={level} type="button" aria-pressed={settings.level === level} onClick={() => window.duet.setLevel(level)}>
              {level}
            </button>
          ))}
        </div>
        <Toggle on={settings.guessFirst} label="Guess first" onChange={window.duet.setGuessFirst} />
        <Toggle
          on={settings.waitForTranslation}
          label="Wait"
          title="Pause the video until the line is translated"
          onChange={window.duet.setWaitForTranslation}
        />
        <button type="button" className="close" aria-label="Hide Duet" onClick={() => window.duet.hide()}>
          ×
        </button>
      </div>
    </header>
  )
}
