// The Script tab: every line of the video with its time, the original in colour and the English.
// The line being spoken is highlighted and kept in view; lines already passed are dimmed; clicking
// a line goes back to it. Without a transcript it lists the lines read so far, newest first.
import { useEffect, useRef } from 'react'
import type { Script as ScriptData } from '../../../shared/types'
import { clock } from '../components/time'
import { Words } from '../components/Words'

export function Script({ script, current }: { script: ScriptData; current: number | null }): React.JSX.Element {
  const list = useRef<HTMLOListElement>(null)
  const timed = script.source === 'transcript'
  const lines = timed ? script.lines : [...script.lines].reverse()
  const currentIndex = script.lines.findIndex((line) => line.id === current)

  // Keep the line being spoken in view, a third of the way down.
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('.is-now')
    if (!row || !list.current) return
    list.current.scrollTo({ top: row.offsetTop - list.current.clientHeight / 3, behavior: 'smooth' })
  }, [current])

  if (!lines.length)
    return (
      <p className="muted center">
        {timed ? 'This video has no lines.' : 'Lines you hear will collect here, so you can go back to them.'}
      </p>
    )
  return (
    <ol className="script" ref={list}>
      {lines.map((line) => {
        const index = script.lines.indexOf(line)
        const processed = line.state === 'ready' ? line.processed : undefined
        return (
          <li key={line.id}>
            <button
              type="button"
              className={`script-row${line.id === current ? ' is-now' : ''}${timed && currentIndex >= 0 && index < currentIndex ? ' is-past' : ''}`}
              onClick={() => window.duet.panel.seek(line.id)}
            >
              <span className="time">{line.start !== undefined ? clock(line.start) : ''}</span>
              <span>
                <span className="original">{processed ? <Words tokens={processed.source} /> : line.original}</span>
                {processed && <span className="english">{processed.translation}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
