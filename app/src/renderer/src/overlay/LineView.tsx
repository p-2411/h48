// The line on the strip: the mixed line, whose words answer back. Hovering a word shows its popup:
// its partner in the other language, a star for the word and Explain for the line.
// Hovering the strip shows the original and the English under the mixed line.
import { useState } from 'react'
import { joinTokens, mixedLine } from '../../../shared/levels'
import type { OverlayLine, OverlaySettings, Token } from '../../../shared/types'
import { JOBS, pairOf } from './words'

type Hover = { pair: number; job: Token['job']; left: number }

function Tokens({
  tokens,
  onHover
}: {
  tokens: (Token & { swapped?: boolean })[]
  onHover: (hover: Hover | undefined) => void
}): React.JSX.Element {
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index}>
          <span
            className={`w${token.swapped ? ' sw' : ''}${token.pair !== null ? ' live' : ''}`}
            data-t={token.job}
            onMouseEnter={(event) => {
              if (token.pair === null) return
              const box = event.currentTarget.getBoundingClientRect()
              const dock = event.currentTarget.closest('.dock')!.getBoundingClientRect()
              onHover({ pair: token.pair, job: token.job, left: box.left - dock.left + box.width / 2 })
            }}
          >
            {token.text}
          </span>
          {token.space ? ' ' : ''}
        </span>
      ))}
    </>
  )
}

export function LineView({
  line,
  settings,
  starred,
  onStar
}: {
  line: OverlayLine
  settings: OverlaySettings
  starred: (pair?: number) => boolean
  onStar: (pair?: number) => void
}): React.JSX.Element {
  const [hover, setHover] = useState<Hover>()
  const ready = line.state === 'ready' ? line.processed : undefined
  if (!ready)
    return (
      <div className="line">
        <p className="mix plain" lang={settings.language}>
          {line.original}
        </p>
      </div>
    )
  const word = hover && pairOf(ready, hover.pair)
  return (
    <div className="line" onMouseLeave={() => setHover(undefined)}>
      {hover && word && (
        <div className="popup" data-solid style={{ left: hover.left }} onMouseEnter={() => setHover(hover)}>
          <span className="job" data-t={hover.job}>
            {JOBS[hover.job]}
          </span>
          <b lang={settings.language}>{word.source}</b>
          <span>{word.english}</span>
          <span className="row">
            <button type="button" className={`pill${starred(hover.pair) ? ' on' : ''}`} onClick={() => onStar(hover.pair)}>
              {starred(hover.pair) ? '★ Saved' : '☆ Save word'}
            </button>
            <button type="button" className="pill" onClick={() => window.duet.explainLine(line.id)}>
              Explain line
            </button>
          </span>
        </div>
      )}
      <p className="mix" lang={settings.level === 5 ? settings.language : undefined}>
        <Tokens tokens={mixedLine(ready, settings.level)} onHover={setHover} />
      </p>
      <div className="more">
        {settings.level < 5 && (
          <p className="source" lang={settings.language}>
            {joinTokens(ready.source)}
          </p>
        )}
        <p className={`english${settings.guessFirst ? ' guess' : ''}`} tabIndex={0}>
          {joinTokens(ready.english)}
        </p>
      </div>
    </div>
  )
}
