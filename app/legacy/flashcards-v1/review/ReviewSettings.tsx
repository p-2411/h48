// Review settings: target recall and new cards per day. Each is saved when the learner lets go of
// it (`onSave`); `onChange` only moves the control.
import type { ReviewSettings as Settings } from '../../../shared/cards'

export function ReviewSettings({
  settings,
  onChange,
  onSave
}: {
  settings: Settings
  onChange: (settings: Settings) => void
  onSave: (settings: Settings) => void
}): React.JSX.Element {
  return (
    <details className="review-settings">
      <summary>Review settings</summary>
      <label className="field">
        <span>
          Target recall: {Math.round(settings.desiredRetention * 100)}% (higher means more reviews)
        </span>
        <input
          type="range"
          min={0.8}
          max={0.97}
          step={0.01}
          value={settings.desiredRetention}
          onChange={(event) =>
            onChange({ ...settings, desiredRetention: Number(event.target.value) })
          }
          onMouseUp={() => onSave(settings)}
          onKeyUp={() => onSave(settings)}
        />
      </label>
      <label className="field">
        <span>New cards per day</span>
        <input
          type="number"
          min={0}
          max={100}
          value={settings.newPerDay}
          // An emptied box is being typed into, not set to 0: nothing changes until there is a number.
          onChange={(event) => event.target.value !== '' && onChange({ ...settings, newPerDay: Number(event.target.value) })}
          onBlur={() => onSave(settings)}
        />
      </label>
      <p className="faint">
        Changes apply to the next ratings; cards already scheduled keep their dates.
      </p>
    </details>
  )
}
