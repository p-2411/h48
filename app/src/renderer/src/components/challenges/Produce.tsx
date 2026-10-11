// Use it: after saying a line back, the learner writes a sentence of their own that could come next,
// using words from the line. Duet says what worked; each word used counts toward its next rung on the
// knowledge ladder.
import type { ProduceView } from '../../../../shared/daily'
import type { ChallengeApi } from './api'
import { AnswerStep } from './AnswerStep'

export function Produce({ challenge, api, onNext }: { challenge: ProduceView; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  return (
    <AnswerStep
      label="Use it"
      inputLabel="Your sentence"
      placeholder="Your sentence"
      check={(sentence) => api.produceCheck(sentence)}
      failure="That sentence could not be checked."
      shown={(result) => (
        <>
          <p>{result.note}</p>
          {result.used.length > 0 && <p className="challenge-faint">Used well: {result.used.join(', ')}</p>}
        </>
      )}
      api={api}
      onNext={onNext}
    >
      <p className="challenge-line">{challenge.original}</p>
      <p className="challenge-hint">“{challenge.translation}”</p>
      <p>What could come next? Write a sentence of your own with a word or two from the line.</p>
      {challenge.words.length > 0 && <p className="challenge-faint">{challenge.words.join(' · ')}</p>}
    </AnswerStep>
  )
}
