// How much of the language the line swaps in, on the strip's hover row: five bars, filled up to the
// level. Clicking a bar sets that level; the line changes at once.
import { languageName } from '../../../shared/languages'
import { type OverlaySettings } from '../../../shared/types'
import { LEVELS } from './words'

export function LevelMeter({ settings }: { settings: OverlaySettings }): React.JSX.Element {
  const language = languageName(settings.language)
  const current = LEVELS.find((item) => item.level === settings.level)!
  return (
    <div className="meter" role="radiogroup" aria-label={`How much ${language} in each line`} title={`${current.name} ${language}: swaps in ${current.adds}`}>
      <span className="meter-name">{current.name}</span>
      {LEVELS.map((item) => (
        <button
          key={item.level}
          type="button"
          role="radio"
          aria-checked={item.level === settings.level}
          aria-label={`${item.name} ${language}`}
          title={`${item.name} ${language}: swaps in ${item.adds}`}
          className={`bar${item.level <= settings.level ? ' on' : ''}`}
          style={{ '--h': `${5 + item.level * 2.4}px` } as React.CSSProperties}
          onClick={() => window.duet.setLevel(item.level)}
        >
          <i />
        </button>
      ))}
    </div>
  )
}
