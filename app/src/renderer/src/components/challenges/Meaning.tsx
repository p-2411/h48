// What did they mean?: one question about a line the learner met, answered in their own words.
import { useEffect, useState } from 'react'
import type { SessionView } from '../../../../shared/daily'
import { say } from '../errors'
import type { ChallengeApi } from './api'
import './challenges.css'

type MeaningView = Extract<NonNullable<SessionView['challenge']>, { kind: 'meaning' }>

export function Meaning({ challenge, api, onNext }: { challenge: MeaningView; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  const [question, setQuestion] = useState<string>()
  const [answer, setAnswer] = useState('')
  const [note, setNote] = useState<string>()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    api.meaningQuestion().then(
      (asked) => setQuestion(asked.question),
      (cause) => setError(say(cause, 'Duet could not ask about this line.'))
    )
  }, [api])
  const check = async (): Promise<void> => {
    setChecking(true)
    setError(undefined)
    try {
      setNote((await api.meaningCheck(answer)).note)
    } catch (cause) {
      setError(say(cause, 'That answer could not be checked.'))
    } finally {
      setChecking(false)
    }
  }
  return (
    <section className="challenge" aria-label="What did they mean?">
      <span className="challenge-label">What did they mean?</span>
      <p className="challenge-line">{challenge.original}</p>
      {question ? <p>{question}</p> : !error && <p className="challenge-faint">Thinking of a question…</p>}
      {question && !note && (
        <form
          className="challenge-answer"
          onSubmit={(event) => {
            event.preventDefault()
            if (answer.trim()) void check()
          }}
        >
          <label className="sr-only" htmlFor="challenge-answer">
            Your answer
          </label>
          <input
            id="challenge-answer"
            value={answer}
            onFocus={() => api.takeKeyboard?.()}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="In your own words"
          />
          <button type="submit" className="challenge-btn primary" disabled={!answer.trim() || checking}>
            {checking ? 'Checking…' : 'Check'}
          </button>
        </form>
      )}
      <div role="status" className="challenge-feedback">
        {note && <p>{note}</p>}
      </div>
      {error && (
        <p className="challenge-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className={`challenge-btn${note ? ' primary' : ' quiet'}`} onClick={() => onNext(!!note)}>
        {note ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
