// The Script tab: every line of the video with its time, the original in colour and the English.
// The line being spoken is highlighted and kept in view; lines already passed are dimmed; clicking
// a line goes back to it; each line can also be explained or starred from here. Without a
// transcript it lists the lines read so far, newest first.
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Script as ScriptData } from '../../../shared/types'
import { clock } from '../components/time'
import { useSettings } from '../components/useSettings'
import { useWordStates } from '../components/useWordStates'
import { Words } from '../components/Words'
import { Icon } from '../components/Icon'
import { DURATION, fade, GLIDING } from '../components/motion'

export function Script({
  script,
  current
}: {
  script: ScriptData
  current: number | null
}): React.JSX.Element {
  const list = useRef<HTMLOListElement>(null)
  // Lines starred from here in this run, being starred now, and whose star failed (pressing again retries).
  const [saved, setSaved] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [failed, setFailed] = useState<Set<number>>(new Set())
  const mark = (
    set: (update: (now: Set<number>) => Set<number>) => void,
    id: number,
    on: boolean
  ): void =>
    set((now) => {
      const next = new Set(now)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const timed = script.source === 'transcript'
  // Each word coloured by how well the learner knows it.
  const language = useSettings()?.language ?? 'es'
  const processedLines = useMemo(() => script.lines.map((line) => (line.state === 'ready' ? line.processed : undefined)), [script.lines])
  const stateOf = useWordStates(language, processedLines)
  const lines = timed ? script.lines : [...script.lines].reverse()
  const currentIndex = script.lines.findIndex((line) => line.id === current)

  // Keep the line being spoken in view, a third of the way down.
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('.is-now')
    if (!row || !list.current) return
    list.current.scrollTo({
      top: row.offsetTop - list.current.clientHeight / 3,
      behavior: 'smooth'
    })
  }, [current])

  if (!lines.length)
    return (
      <p className="muted center">
        {timed
          ? 'This video has no lines.'
          : 'Lines you hear will collect here, so you can go back to them.'}
      </p>
    )
  return (
    <motion.ol className="script" ref={list} {...fade(DURATION.fast)}>
      {lines.map((line) => {
        const index = script.lines.indexOf(line)
        const processed = line.state === 'ready' ? line.processed : undefined
        return (
          <li
            key={line.id}
            className={`script-item${line.id === current ? ' is-now' : ''}${timed && currentIndex >= 0 && index < currentIndex ? ' is-past' : ''}`}
          >
            {/* One highlight, gliding to the line being spoken. */}
            {line.id === current && <motion.span layoutId="script-now" className="script-now" transition={GLIDING} aria-hidden="true" />}
            <button
              type="button"
              className="script-row"
              onClick={() => window.duet.panel.seek(line.id)}
            >
              <span className="time">{line.start !== undefined ? clock(line.start) : ''}</span>
              <span>
                <span className="original">
                  {processed ? <Words tokens={processed.source} state={(pair) => stateOf(processed, pair)} /> : line.original}
                </span>
                {processed && <span className="english">{processed.translation}</span>}
              </span>
            </button>
            <span className="row-actions">
              <button
                type="button"
                className="btn quiet"
                onClick={() => window.duet.explainLine(line.id)}
              >
                Explain
              </button>
              <button
                type="button"
                className="btn quiet"
                disabled={!processed || saved.has(line.id) || saving.has(line.id)}
                title={failed.has(line.id) ? 'Could not save this line. Press to try again.' : undefined}
                onClick={async () => {
                  mark(setSaving, line.id, true)
                  mark(setFailed, line.id, false)
                  try {
                    if (await window.duet.save(line.id)) mark(setSaved, line.id, true)
                  } catch {
                    mark(setFailed, line.id, true)
                  } finally {
                    mark(setSaving, line.id, false)
                  }
                }}
              >
                <Icon name="star" size={14} filled={saved.has(line.id)} />
                {saved.has(line.id)
                  ? 'Saved'
                  : saving.has(line.id)
                    ? 'Saving…'
                    : failed.has(line.id)
                      ? 'Try again'
                      : 'Save'}
              </button>
            </span>
          </li>
        )
      })}
    </motion.ol>
  )
}
