// What did they mean?: one question about a line the learner met, answered in their own words.
import { useEffect, useState } from 'react'
import type { MeaningView } from '../../../../shared/daily'
import { say } from '../errors'
import type { ChallengeApi } from './api'
import { AnswerStep } from './AnswerStep'

export function Meaning({ challenge, api, onNext }: { challenge: MeaningView; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  const [question, setQuestion] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    api.meaningQuestion().then(
      (asked) => setQuestion(asked.question),
      (cause) => setError(say(cause, 'Duet could not ask about this line.'))
    )
  }, [api])
  return (
    <AnswerStep
      label="What did they mean?"
      ready={!!question}
      error={error}
      inputLabel="Your answer"
      placeholder="In your own words"
      check={(answer) => api.meaningCheck(answer)}
      failure="That answer could not be checked."
      shown={(marked) => <p>{marked.note}</p>}
      api={api}
      onNext={onNext}
    >
      <p className="challenge-line">{challenge.original}</p>
      {question ? <p>{question}</p> : !error && <p className="challenge-faint">Thinking of a question…</p>}
    </AnswerStep>
  )
}
