// The overlay panel: the line being spoken, at the learner's level, coloured by each word's job.
import { useEffect, useMemo, useState } from 'react'
import { joinTokens, mixedLine } from '../../shared/levels'
import {
  LANGUAGES,
  type Language,
  type Level,
  type OverlayLine,
  type OverlaySettings,
  type OverlayStatus,
  type Token
} from '../../shared/types'

const LEVELS: Level[] = [1, 2, 3, 4, 5]

function statusText(status: OverlayStatus, language: Language): string {
  if (status.error) return status.error
  if (!status.trusted) return 'Needs Accessibility permission'
  if (!status.url) return `Open a YouTube or Netflix video with ${LANGUAGES[language]} captions`
  const browser = status.browser ?? 'your browser'
  // With the video's transcript, the captions in the player don't matter.
  if (status.source === 'transcript') return `Following the transcript in ${browser}`
  if (status.available === false) return 'This video has no captions. Try another video'
  if (!status.captions) return 'Turn on captions in the player'
  const site = status.url.includes('netflix.com') ? 'Netflix' : 'YouTube'
  return `Reading ${site} in ${browser}`
}

function Words({ tokens, swapped }: { tokens: (Token & { swapped?: boolean })[]; swapped?: boolean }): React.JSX.Element {
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index}>
          <span className={`w${token.swapped || swapped ? ' sw' : ''}`} data-t={token.job}>
            {token.text}
          </span>
          {token.space ? ' ' : ''}
        </span>
      ))}
    </>
  )
}

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<OverlaySettings>({ language: 'es', level: 2, guessFirst: true, waitForTranslation: true })
  const [status, setStatus] = useState<OverlayStatus>({ trusted: false })
  const [lines, setLines] = useState<OverlayLine[]>([])
  const [live, setLive] = useState('')
  const [currentId, setCurrentId] = useState<number | null>(null)

  useEffect(() => {
    window.duet.getState().then((state) => {
      setSettings(state.settings)
      setStatus(state.status)
    })
    const unsubscribe = [
      window.duet.onStatus(setStatus),
      window.duet.onSettings(setSettings),
      window.duet.onLive(setLive),
      window.duet.onCurrent(setCurrentId),
      window.duet.onLine((line) =>
        setLines((current) => {
          const others = current.filter((item) => item.id !== line.id)
          return [...others, line].sort((a, b) => a.id - b.id).slice(-40)
        })
      )
    ]
    return () => unsubscribe.forEach((stop) => stop())
  }, [])

  // The line that belongs on screen now; a line that failed shows as it was spoken.
  const current = useMemo(() => lines.find((line) => line.id === currentId), [lines, currentId])
  const ready = current?.state === 'ready' ? current.processed : undefined
  // A caption still being spoken that is not yet a finished line (only when reading the screen).
  const building = status.source !== 'transcript' && live && live !== current?.original ? live : ''

  return (
    <div className="panel">
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
              <button
                key={level}
                type="button"
                aria-pressed={settings.level === level}
                onClick={() => window.duet.setLevel(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`toggle${settings.guessFirst ? ' is-on' : ''}`}
            aria-pressed={settings.guessFirst}
            onClick={() => window.duet.setGuessFirst(!settings.guessFirst)}
          >
            <span className="switch" aria-hidden="true">
              <i />
            </span>
            Guess first
          </button>
          <button
            type="button"
            className={`toggle${settings.waitForTranslation ? ' is-on' : ''}`}
            aria-pressed={settings.waitForTranslation}
            title="Pause the video until the line is translated"
            onClick={() => window.duet.setWaitForTranslation(!settings.waitForTranslation)}
          >
            <span className="switch" aria-hidden="true">
              <i />
            </span>
            Wait
          </button>
          <button type="button" className="close" aria-label="Hide Duet" onClick={() => window.duet.hide()}>
            ×
          </button>
        </div>
      </header>

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
        ) : current ? (
          <>
            <p className="mix plain">{current.original}</p>
            {current.state === 'pending' && <p className="pending">Translating…</p>}
          </>
        ) : (
          <p className="empty">{status.modelError ?? 'Lines appear here as they are spoken.'}</p>
        )}
        {building && <p className="building">{building}</p>}
        {status.modelError && current && <p className="error">{status.modelError}</p>}
      </main>
    </div>
  )
}

export default App
