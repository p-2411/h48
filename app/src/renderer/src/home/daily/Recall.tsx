// Recall a word: a line the learner met with one word blanked, and three to choose from.
import { useState } from 'react'
import type { SessionView } from '../../../../shared/daily'
import { say } from '../../components/errors'

type RecallView = Extract<NonNullable<SessionView['challenge']>, { kind: 'recall' }>

export function Recall({ challenge, onNext }: { challenge: RecallView; onNext: () => void }): React.JSX.Element {
  const [result, setResult] = useState<{ picked: string; correct: boolean; answer: string }>()
  const [error, setError] = useState<string>()
  const pick = async (choice: string): Promise<void> => {
    setError(undefined)
    try {
      setResult({ picked: choice, ...(await window.duet.daily.checkRecall(choice)) })
    } catch (cause) {
      setError(say(cause, 'That could not be checked.'))
    }
  }
  const blank = result ? result.answer : '＿＿＿'
  return (
    <section className="card-box daily-step" aria-label="Recall a word">
      <span className="label">Which word goes here?</span>
      <p className="big-line">
        {challenge.before}
        {challenge.spaceBefore && ' '}
        <span className={`daily-blank${result ? (result.correct ? ' is-right' : ' is-wrong') : ''}`}>{blank}</span>
        {challenge.spaceAfter && ' '}
        {challenge.after}
      </p>
      <p className="muted">{challenge.translation}</p>
      <div className="row" role="group" aria-label="Choices">
        {challenge.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            className={`btn${result?.answer === choice ? ' primary' : ''}`}
            aria-pressed={result?.picked === choice}
            disabled={!!result}
            onClick={() => void pick(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div role="status" className="daily-feedback">
        {result && <p>{result.correct ? 'Yes, that’s the one.' : `Not quite: it’s ${result.answer}.`}</p>}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className={`btn${result ? ' primary' : ' quiet'}`} onClick={onNext}>
        {result ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
