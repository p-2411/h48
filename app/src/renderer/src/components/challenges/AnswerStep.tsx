// A challenge answered in the learner's own words (What did they mean?, Use it): what it asks
// (`children`), a box to write in, Duet's answer to what was written, and Next once answered (Skip
// before). The step says what failed, in place, and the form stays for another try.
import { useState } from 'react'
import { say } from '../errors'
import type { ChallengeApi } from './api'
import './challenges.css'

export function AnswerStep<Result>({
  label,
  children,
  ready = true,
  error: askError,
  inputLabel,
  placeholder,
  check,
  failure,
  shown,
  api,
  onNext
}: {
  /** The step's name, as its label and for screen readers. */
  label: string
  children: React.ReactNode
  /** The step can be answered (for one that asks its question first). */
  ready?: boolean
  /** Why it couldn't be asked. */
  error?: string
  inputLabel: string
  placeholder: string
  check: (answer: string) => Promise<Result>
  /** What to say when the answer couldn't be checked. */
  failure: string
  /** Duet's answer, shown under the box. */
  shown: (result: Result) => React.ReactNode
  api: ChallengeApi
  onNext: (answered: boolean) => void
}): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Result>()
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string>()
  const submit = async (): Promise<void> => {
    setChecking(true)
    setCheckError(undefined)
    try {
      setResult(await check(answer))
    } catch (cause) {
      setCheckError(say(cause, failure))
    } finally {
      setChecking(false)
    }
  }
  const error = askError ?? checkError
  const answered = result !== undefined
  return (
    <section className="challenge" aria-label={label}>
      <span className="challenge-label">{label}</span>
      {children}
      {ready && !answered && (
        <form
          className="challenge-answer"
          onSubmit={(event) => {
            event.preventDefault()
            if (answer.trim()) void submit()
          }}
        >
          <label className="sr-only" htmlFor="challenge-answer">
            {inputLabel}
          </label>
          <input
            id="challenge-answer"
            value={answer}
            onFocus={() => api.takeKeyboard?.()}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={placeholder}
          />
          <button
            type="submit"
            className="challenge-btn primary"
            disabled={!answer.trim() || checking}
          >
            {checking ? 'Checking…' : 'Check'}
          </button>
        </form>
      )}
      <div role="status" className="challenge-feedback">
        {answered && shown(result)}
      </div>
      {error && (
        <p className="challenge-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`challenge-btn${answered ? ' primary' : ' quiet'}`}
        onClick={() => onNext(answered)}
      >
        {answered ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
