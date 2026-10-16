// Make a card: type the word; Duet fills in what it means from the dictionary, and writes a line when
// it's left empty. The back previews beside the form. Keep, or Keep and make another.
import { useEffect, useRef, useState } from 'react'
import type { DictEntry } from '../../../../shared/flashcards'
import type { Language } from '../../../../shared/types'
import { say } from '../../components/errors'
import { ByDuet, Entry } from './Entry'

// The dictionary is asked this long after the last key.
const LOOKUP_MS = 450

export function MakeCard({
  language,
  initial,
  onKept
}: {
  language: Language
  /** A word to start with (Make a card from Words). */
  initial?: string
  onKept: (word: string, another: boolean) => void
}): React.JSX.Element {
  const [word, setWord] = useState(initial ?? '')
  const [meaning, setMeaning] = useState('')
  const [line, setLine] = useState('')
  const [entry, setEntry] = useState<DictEntry>()
  const [filled, setFilled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const first = useRef<HTMLInputElement>(null)
  // The meaning the dictionary filled in, so a changed word can replace it (but never the learner's).
  const filledMeaning = useRef('')

  useEffect(() => first.current?.focus(), [])
  useEffect(() => {
    const typed = word.trim()
    if (!typed) return
    let live = true
    const timer = window.setTimeout(() => {
      window.duet.flashcards.lookup(language, typed).then(
        (found) => {
          if (!live) return
          setEntry(found.entry)
          if (found.meaning && (!meaning.trim() || meaning === filledMeaning.current)) {
            filledMeaning.current = found.meaning
            setMeaning(found.meaning)
            setFilled(true)
          }
        },
        () => live && setEntry(undefined)
      )
    }, LOOKUP_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
    // Only the word asks the dictionary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, language])

  const keep = async (another: boolean): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const card = await window.duet.flashcards.make({
        language,
        word: word.trim(),
        meaning: meaning.trim() || undefined,
        line: line.trim()
      })
      onKept(card.expression, another)
      if (another) {
        setWord('')
        setMeaning('')
        setLine('')
        setEntry(undefined)
        setFilled(false)
        filledMeaning.current = ''
        first.current?.focus()
      }
    } catch (cause) {
      setError(say(cause, 'That card could not be kept.'))
    } finally {
      setBusy(false)
    }
  }

  const ready = !!word.trim() && (!!meaning.trim() || !!entry?.senses.length)
  const typedLine = line.trim()
  return (
    <div className="fc-make">
      <form
        className="fc-make-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready && !busy) void keep(false)
        }}
      >
        <h2>Make a card</h2>
        <label className="fc-field big">
          <span>Word or phrase</span>
          <input
            ref={first}
            type="text"
            value={word}
            autoComplete="off"
            onChange={(event) => {
              setWord(event.target.value)
              // Cleared: nothing looked up any more.
              if (!event.target.value.trim()) {
                setEntry(undefined)
                setFilled(false)
              }
            }}
          />
        </label>
        {filled && (
          <p className="fc-filled">
            <ByDuet />
            Duet filled in the rest. Change anything you like.
          </p>
        )}
        <label className="fc-field">
          <span>What it means</span>
          <input type="text" value={meaning} onChange={(event) => setMeaning(event.target.value)} />
        </label>
        <label className="fc-field">
          <span>A line it’s used in</span>
          <input
            type="text"
            value={line}
            placeholder="Leave empty and Duet writes one"
            onChange={(event) => setLine(event.target.value)}
          />
          <small>Hear it in a video later and Duet adds that line too.</small>
        </label>
        <label className="fc-field">
          <span>Collection</span>
          <select value="made" disabled>
            <option value="made">Made by you</option>
          </select>
        </label>
        {error && <p className="fc-small error">{error}</p>}
        <div className="fc-make-actions">
          <button type="submit" className="primary" disabled={!ready || busy}>
            {busy ? 'Keeping…' : 'Keep'}
          </button>
          <button
            type="button"
            className="soft"
            disabled={!ready || busy}
            onClick={() => void keep(true)}
          >
            Keep and make another
          </button>
        </div>
      </form>
      <div className="fc-make-preview">
        <span>The back of its card</span>
        <div className="fc-card" style={{ animation: 'none' }}>
          <Entry
            data={{
              word: word.trim() || 'Your word',
              step: 'heard',
              entry:
                entry ?? (word.trim() ? undefined : { word: 'Your word', senses: [], related: [] }),
              meaning: meaning.trim() || 'What it means',
              line: {
                before: typedLine || entry?.example?.line || 'Duet writes an example for you.',
                word: '',
                after: '',
                found: false
              },
              heardTimes: 0,
              tips: [],
              byDuet: !typedLine
            }}
          />
        </div>
        <p>
          The front starts as a sentence card, then asks a little more each time the word climbs.
        </p>
      </div>
    </div>
  )
}
