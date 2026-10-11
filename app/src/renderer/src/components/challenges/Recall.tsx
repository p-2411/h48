// Recall a word: a line the learner met with one word blanked, and three to choose from.
import { useState } from 'react'
import type { SessionView } from '../../../../shared/daily'
import { say } from '../errors'
import type { ChallengeApi } from './api'
import './challenges.css'

type RecallView = Extract<NonNullable<SessionView['challenge']>, { kind: 'recall' }>

export function Recall({ challenge, api, onNext }: { challenge: RecallView; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  const [result, setResult] = useState<{ picked: string; correct: boolean; answer: string }>()
  const [error, setError] = useState<string>()
  const pick = async (choice: string): Promise<void> => {
    setError(undefined)
    try {
      setResult({ picked: choice, ...(await api.checkRecall(choice)) })
    } catch (cause) {
      setError(say(cause, 'That could not be checked.'))
    }
  }
  const blank = result ? result.answer : '＿＿＿'
  return (
    <section className="challenge" aria-label="Recall a word">
      <span className="challenge-label">Which word goes here?</span>
      <p className="challenge-line">
        {challenge.before}
        {challenge.spaceBefore && ' '}
        <span className={`challenge-blank${result ? (result.correct ? ' is-right' : ' is-wrong') : ''}`}>{blank}</span>
        {challenge.spaceAfter && ' '}
        {challenge.after}
      </p>
      <p className="challenge-hint">{challenge.translation}</p>
      <div className="challenge-row" role="group" aria-label="Choices">
        {challenge.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            className={`challenge-btn${result?.answer === choice ? ' primary' : ''}`}
            aria-pressed={result?.picked === choice}
            disabled={!!result}
            onClick={() => void pick(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div role="status" className="challenge-feedback">
        {result && <p>{result.correct ? 'Yes, that’s the one.' : `Not quite: it’s ${result.answer}. It’s in your cards now.`}</p>}
      </div>
      {error && (
        <p className="challenge-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className={`challenge-btn${result ? ' primary' : ' quiet'}`} onClick={() => onNext(!!result)}>
        {result ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
