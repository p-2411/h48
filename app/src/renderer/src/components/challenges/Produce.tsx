// Use it: after saying a line back, the learner writes a sentence of their own that could come next,
// using words from the line. Duet says what worked; each word used counts toward its next rung on the knowledge ladder.
import { useState } from 'react'
import type { ProduceView } from '../../../../shared/daily'
import { say } from '../errors'
import type { ChallengeApi } from './api'
import './challenges.css'

export function Produce({ challenge, api, onNext }: { challenge: ProduceView; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  const [sentence, setSentence] = useState('')
  const [result, setResult] = useState<{ note: string; used: string[] }>()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string>()
  const check = async (): Promise<void> => {
    setChecking(true)
    setError(undefined)
    try {
      setResult(await api.produceCheck(sentence))
    } catch (cause) {
      setError(say(cause, 'That sentence could not be checked.'))
    } finally {
      setChecking(false)
    }
  }
  return (
    <section className="challenge" aria-label="Use it">
      <span className="challenge-label">Use it</span>
      <p className="challenge-line">{challenge.original}</p>
      <p className="challenge-hint">“{challenge.translation}”</p>
      <p>What could come next? Write a sentence of your own with a word or two from the line.</p>
      {challenge.words.length > 0 && <p className="challenge-faint">{challenge.words.join(' · ')}</p>}
      {!result && (
        <form
          className="challenge-answer"
          onSubmit={(event) => {
            event.preventDefault()
            if (sentence.trim()) void check()
          }}
        >
          <label className="sr-only" htmlFor="challenge-sentence">
            Your sentence
          </label>
          <input id="challenge-sentence" value={sentence} onFocus={() => api.takeKeyboard?.()} onChange={(event) => setSentence(event.target.value)} placeholder="Your sentence" />
          <button type="submit" className="challenge-btn primary" disabled={!sentence.trim() || checking}>
            {checking ? 'Checking…' : 'Check'}
          </button>
        </form>
      )}
      <div role="status" className="challenge-feedback">
        {result && <p>{result.note}</p>}
        {result && result.used.length > 0 && <p className="challenge-faint">Used well: {result.used.join(', ')}</p>}
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
