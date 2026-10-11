// The line being spoken, at the learner's level: the mixed line, the original in colour, and the
// English (blurred until hovered when guessing first).
import { joinTokens, mixedLine } from '../../../shared/levels'
import type { OverlayLine, OverlaySettings } from '../../../shared/types'
import { Words } from '../components/Words'

export function Line({
  line,
  settings,
  building,
  modelError
}: {
  line?: OverlayLine
  settings: OverlaySettings
  building: string
  modelError?: string
}): React.JSX.Element {
  const ready = line?.state === 'ready' ? line.processed : undefined
  return (
    <main className="now" aria-live="polite">
      {ready ? (
        <>
          <p className="mix">
            <Words tokens={mixedLine(ready, settings.level)} />
          </p>
          {settings.level < 5 && (
            <p className="source" lang={settings.language}>
              <Words tokens={ready.source} />
            </p>
          )}
          <p className={`english${settings.guessFirst ? ' guess' : ''}`} tabIndex={0}>
            {settings.level === 5 ? <Words tokens={ready.english} /> : joinTokens(ready.english)}
          </p>
        </>
      ) : line ? (
        // A line still being translated, or one that failed, shows as it was spoken.
        <>
          <p className="mix plain">{line.original}</p>
          {line.state === 'pending' && <p className="pending">Translating…</p>}
        </>
      ) : (
        <p className="empty">{modelError ?? 'Lines appear here as they are spoken.'}</p>
      )}
      {building && <p className="building">{building}</p>}
      {modelError && line && <p className="error">{modelError}</p>}
    </main>
  )
}
