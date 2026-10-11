// The voice tutor window. For now it shows the moment it was opened on: the line, its translation
// and the lines before it. The conversation and pronunciation practice are built here.
import { useEffect, useState } from 'react'
import type { Moment } from '../../../shared/moment'
import { LANGUAGES } from '../../../shared/types'
import { Words } from '../components/Words'

export function Tutor(): React.JSX.Element {
  const [moment, setMoment] = useState<Moment>()

  useEffect(() => {
    window.duet.tutor.getMoment().then(setMoment)
    return window.duet.tutor.onMoment(setMoment)
  }, [])

  if (!moment) return <main className="tutor empty">Open the tutor from a line in the overlay.</main>
  const processed = moment.line.processed
  return (
    <main className="tutor">
      <header>
        <h1>Talk about this</h1>
        <button type="button" className="close" aria-label="Close tutor" onClick={() => window.duet.tutor.close()}>
          ×
        </button>
      </header>
      <section className="moment" aria-label="The line">
        <p className="source" lang={moment.language}>
          {processed ? <Words tokens={processed.source} /> : moment.line.original}
        </p>
        {processed && <p className="english">{processed.translation}</p>}
        <p className="meta">
          {LANGUAGES[moment.language]} · {moment.video.site}
          {moment.video.position !== undefined && ` · ${Math.floor(moment.video.position / 60)}:${String(Math.floor(moment.video.position % 60)).padStart(2, '0')}`}
        </p>
      </section>
      {moment.earlier.length > 0 && (
        <details className="context">
          <summary>Conversation context ({moment.earlier.length} lines before)</summary>
          {moment.earlier.map((line, index) => (
            <p key={index}>
              <span lang={moment.language}>{line.original}</span>
              {line.translation && <span className="english"> {line.translation}</span>}
            </p>
          ))}
        </details>
      )}
    </main>
  )
}
