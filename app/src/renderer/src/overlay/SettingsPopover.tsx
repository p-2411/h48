// The ⚙ popover: what changes once in a while (language, how much of it, the pauses), kept off
// the strip. The level picker previews the line on screen at each level.
import { mixedLine } from '../../../shared/levels'
import { LANGUAGES, type Language, type OverlayLine, type OverlaySettings } from '../../../shared/types'
import { Words } from '../components/Words'
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

export function SettingsPopover({ settings, line }: { settings: OverlaySettings; line?: OverlayLine }): React.JSX.Element {
  const ready = line?.state === 'ready' ? line.processed : undefined
  const level = LEVELS.find((item) => item.level === settings.level)!
  return (
    <div className="settings" data-solid role="dialog" aria-label="Settings">
      <span className="label">Learning</span>
      <div className="segment" role="group" aria-label="Language">
        {(Object.keys(LANGUAGES) as Language[]).map((language) => (
          <button key={language} type="button" aria-pressed={settings.language === language} onClick={() => window.duet.setLanguage(language)}>
            {LANGUAGES[language]}
          </button>
        ))}
      </div>
      <span className="label">How much {LANGUAGES[settings.language]} in each line</span>
      <div className="segment" role="group" aria-label="Level">
        {LEVELS.map((item) => (
          <button key={item.level} type="button" aria-pressed={settings.level === item.level} onClick={() => window.duet.setLevel(item.level)}>
            {item.name}
          </button>
        ))}
      </div>
      <p className="preview">
        {ready ? <Words tokens={mixedLine(ready, settings.level)} /> : <span className="hint">Swaps in {level.adds}.</span>}
      </p>
      <Toggle on={settings.guessFirst} label="Hide English until I look" hint="Hover the English to see it" onChange={window.duet.setGuessFirst} />
      <Toggle
        on={settings.waitForTranslation}
        label="Pause for slow translations"
        hint="Only on videos with a transcript"
        onChange={window.duet.setWaitForTranslation}
      />
      <Toggle on={settings.pauseForHelp} label="Pause while explaining" hint="While the Explain panel is open" onChange={window.duet.setPauseForHelp} />
      <button type="button" className="quiet" onClick={() => window.duet.hide()}>
        Hide Duet <kbd>⌥⇧D</kbd>
      </button>
    </div>
  )
}
