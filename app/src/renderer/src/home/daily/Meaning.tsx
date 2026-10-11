// What did they mean?: one question about a line the learner met, answered in their own words.
import { useEffect, useState } from 'react'
import type { SessionView } from '../../../../shared/daily'
import { say } from '../../components/errors'

type MeaningView = Extract<NonNullable<SessionView['challenge']>, { kind: 'meaning' }>

export function Meaning({ challenge, onNext }: { challenge: MeaningView; onNext: () => void }): React.JSX.Element {
  const [question, setQuestion] = useState<string>()
  const [answer, setAnswer] = useState('')
  const [note, setNote] = useState<string>()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    window.duet.daily.meaningQuestion().then(
      (asked) => setQuestion(asked.question),
      (cause) => setError(say(cause, 'Duet could not ask about this line.'))
    )
  }, [])
  const check = async (): Promise<void> => {
    setChecking(true)
    setError(undefined)
    try {
      setNote((await window.duet.daily.meaningCheck(answer)).note)
    } catch (cause) {
      setError(say(cause, 'That answer could not be checked.'))
    } finally {
      setChecking(false)
    }
  }
  return (
    <section className="card-box daily-step" aria-label="What did they mean?">
      <span className="label">What did they mean?</span>
      <p className="big-line">{challenge.original}</p>
      {question ? <p>{question}</p> : !error && <p className="faint">Thinking of a question…</p>}
      {question && !note && (
        <form
          className="daily-answer"
          onSubmit={(event) => {
            event.preventDefault()
            if (answer.trim()) void check()
          }}
        >
          <label className="sr-only" htmlFor="daily-answer">
            Your answer
          </label>
          <input id="daily-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="In your own words" />
          <button type="submit" className="btn primary" disabled={!answer.trim() || checking}>
            {checking ? 'Checking…' : 'Check'}
          </button>
        </form>
      )}
      <div role="status" className="daily-feedback">
        {note && <p>{note}</p>}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className={`btn${note ? ' primary' : ' quiet'}`} onClick={onNext}>
        {note ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
