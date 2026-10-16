// Recall a word: a line the learner met with one word blanked, and three to choose from.
import { useState } from 'react'
import type { RecallResult, RecallView } from '../../../../shared/daily'
import { say } from '../errors'
import type { ChallengeApi } from './api'
import './challenges.css'
import { duetReact } from '../duet/react'


export function Recall({ challenge, api, onNext }: { challenge: RecallView; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  const [result, setResult] = useState<RecallResult & { picked: string }>()
  const [error, setError] = useState<string>()
  // A pick being checked: the choices wait, so a second pick can't take its place.
  const [checking, setChecking] = useState(false)
  const pick = async (choice: string): Promise<void> => {
    if (checking) return
    setError(undefined)
    setChecking(true)
    try {
      const checked = await api.checkRecall(choice)
      duetReact(checked.correct ? 'right' : 'not-yet')
      setResult({ picked: choice, ...checked })
    } catch (cause) {
      setError(say(cause, 'That could not be checked.'))
    } finally {
      setChecking(false)
    }
  }
  // Until answered, the blank is an empty space a word wide (its line is the blank's underline; a
  // screen reader hears "blank"); then the answer chosen.
  const blank = result ? (
    result.answer
  ) : (
    <>
      {'\u3000\u3000'}
      <span className="sr-only">blank</span>
    </>
  )
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
            disabled={!!result || checking}
            onClick={() => void pick(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div role="status" className="challenge-feedback">
        {result && <p>{result.correct ? 'Yes, that’s the one.' : `Not quite: it’s ${result.answer}.${result.carded ? ' It’s in your cards now.' : ''}`}</p>}
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
