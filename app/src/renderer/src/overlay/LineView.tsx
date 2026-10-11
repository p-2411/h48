// The line on the strip: the mixed line, whose words answer back. Hovering a word shows its popup:
// the word, how it is read (in Latin letters, for Japanese and Korean), its English, a star for the
// word and Explain for the line. Swapped-in words are written in their own script or their reading
// (a setting). Hovering the strip shows the original and, unless turned off, the English under it.
import { useEffect, useRef, useState } from 'react'
import { joinTokens, mixedLine, pairReading, written } from '../../../shared/levels'
import type { OverlayLine, OverlaySettings, Token, WordScript } from '../../../shared/types'
import { hoverOn, JOBS, pairOf } from './words'
import { Icon } from '../components/Icon'

// A word counts as looked at (for the watch log) once the pointer rests on it this long; passing
// over words on the way somewhere doesn't count.
const HOVER_DWELL_MS = 300
// Leaving a word (or the line) closes its popup only after this long, so the pointer can cross the
// strip's edge on its way up into the popup; entering the popup or another word keeps one open.
const LEAVE_GRACE_MS = 250

type Hover = { pair: number; job: Token['job']; left: number }
/** A hover, with the line it was on (see hoverOn). */
type LineHover = Hover & { lineId: number }

function Tokens({
  tokens,
  script,
  onHover,
  onLeave
}: {
  tokens: (Token & { swapped?: boolean })[]
  /** How the swapped-in words are written: their own script, or their reading. */
  script: WordScript
  onHover: (hover: Hover | undefined) => void
  /** The pointer left a word: its popup closes, unless the pointer goes into it. */
  onLeave: () => void
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
              onHover({
                pair: token.pair,
                job: token.job,
                left: box.left - dock.left + box.width / 2
              })
            }}
            onMouseLeave={token.pair === null ? undefined : onLeave}
          >
            {token.swapped ? written(token, script) : token.text}
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
  const [lineHover, setLineHover] = useState<LineHover>()
  const leaving = useRef<number | undefined>(undefined)
  const setHover = (next: LineHover | undefined): void => {
    window.clearTimeout(leaving.current)
    setLineHover(next)
  }
  const leave = (): void => {
    window.clearTimeout(leaving.current)
    leaving.current = window.setTimeout(() => setLineHover(undefined), LEAVE_GRACE_MS)
  }
  useEffect(() => () => window.clearTimeout(leaving.current), [])
  const hover = hoverOn(lineHover, line.id)
  const ready = line.state === 'ready' ? line.processed : undefined
  const word = hover && ready ? pairOf(ready, hover.pair) : undefined
  // How the hovered word is read, in Latin letters (Japanese, Korean), when the line has it.
  const reading = hover && ready ? pairReading(ready.source, hover.pair) : undefined
  const hoveredText = word?.source
  useEffect(() => {
    if (!hoveredText) return
    const timer = window.setTimeout(
      () => window.duet.hoveredWord(line.id, hoveredText),
      HOVER_DWELL_MS
    )
    return () => window.clearTimeout(timer)
  }, [line.id, hoveredText])
  if (!ready)
    return (
      <div className="line">
        <p className="mix plain" lang={settings.language}>
          {line.original}
        </p>
      </div>
    )
  return (
    <div className="line" onMouseLeave={leave}>
      {hover && word && (
        <div
          className="popup"
          data-solid
          style={{ '--x': `${hover.left}px` } as React.CSSProperties}
          onMouseEnter={() => setHover(lineHover)}
          onMouseLeave={leave}
        >
          <span className="job" data-t={hover.job}>
            {JOBS[hover.job]}
          </span>
          <b lang={settings.language}>{word.source}</b>
          {reading && <span className="reading">{reading}</span>}
          <span>{word.english}</span>
          <span className="row">
            <button
              type="button"
              className={`pill${starred(hover.pair) ? ' on' : ''}`}
              onClick={() => onStar(hover.pair)}
            >
              <Icon name="star" size={13} filled={starred(hover.pair)} />
              {starred(hover.pair) ? 'Saved' : 'Save'}
            </button>
            <button type="button" className="pill" onClick={() => window.duet.explainLine(line.id)}>
              Explain line
            </button>
          </span>
        </div>
      )}
      <p className="mix" lang={settings.level === 5 ? settings.language : undefined}>
        <Tokens
          tokens={mixedLine(ready, settings.level)}
          script={settings.wordScript}
          onLeave={leave}
          onHover={(next) => setHover(next && { ...next, lineId: line.id })}
        />
      </p>
      <div className="more">
        {settings.level < 5 && (
          <p className="source" lang={settings.language}>
            {joinTokens(ready.source)}
          </p>
        )}
        {settings.showEnglish && (
          <p className={`english${settings.guessFirst ? ' guess' : ''}`} tabIndex={0}>
            {joinTokens(ready.english)}
          </p>
        )}
      </div>
    </div>
  )
}
