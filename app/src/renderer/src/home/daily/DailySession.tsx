// The daily session: the due cards (capped at about 5 minutes), then a line said back, then one
// challenge, then "done for today" with the streak. Each step can be skipped; what's in it comes
// from main (src/main/daily) and the last video watched.
import { useEffect, useState } from 'react'
import type { HomeToday } from '../../../../shared/home'
import type { SessionView } from '../../../../shared/daily'
import { say } from '../../components/errors'
import { Review } from '../../review/Review'
import { Meaning } from '../../components/challenges/Meaning'
import { Recall } from '../../components/challenges/Recall'
import { SayLine } from '../../components/challenges/SayLine'

type Step = 'cards' | 'say' | 'challenge' | 'done'

function stepsOf(plan: SessionView): Step[] {
  return [...(plan.cards > 0 ? (['cards'] as const) : []), ...(plan.say ? (['say'] as const) : []), ...(plan.challenge ? (['challenge'] as const) : []), 'done']
}

export function DailySession({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [plan, setPlan] = useState<SessionView>()
  const [error, setError] = useState<string>()
  const [at, setAt] = useState(0)
  const [streak, setStreak] = useState<HomeToday['streak']>()
  useEffect(() => {
    window.duet.daily.plan().then(setPlan, (cause) => setError(say(cause, 'Today’s session could not start.')))
  }, [])
  const steps = plan ? stepsOf(plan) : []
  const step = steps[at]
  // Reaching the end keeps the day; once, however the page re-renders.
  useEffect(() => {
    if (step !== 'done') return
    window.duet.daily.done().then(setStreak, (cause) => setError(say(cause, 'Could not record today.')))
  }, [step])
  const next = (): void => setAt((index) => index + 1)

  if (error && !plan)
    return (
      <p className="notice error row" role="alert">
        <span>{error}</span>
        <button type="button" className="btn quiet" onClick={onClose}>
          Back
        </button>
      </p>
    )
  if (!plan)
    return (
      <p className="faint" role="status">
        Getting today’s session ready…
      </p>
    )
  return (
    <div className="daily">
      <p className="faint daily-progress">
        {step === 'done' ? 'Done' : `Step ${at + 1} of ${steps.length - 1}`}
        {plan.video && step !== 'cards' && step !== 'done' && ` · from ${plan.video}`}
      </p>
      {step === 'cards' && <Review limit={plan.cards} onEnd={next} />}
      {step === 'say' && plan.say && <SayLine line={plan.say} api={window.duet.daily} onNext={next} />}
      {step === 'challenge' && plan.challenge?.kind === 'recall' && <Recall challenge={plan.challenge} api={window.duet.daily} onNext={next} />}
      {step === 'challenge' && plan.challenge?.kind === 'meaning' && <Meaning challenge={plan.challenge} api={window.duet.daily} onNext={next} />}
      {step === 'done' && (
        <section className="card-box" aria-label="Done for today">
          <span className="label">Done for today</span>
          <p className="home-number">{streak ? `${streak.days} ${streak.days === 1 ? 'day' : 'days'}` : '…'}</p>
          <p className="muted">{steps.length === 1 ? 'You’re all caught up: nothing due, and nothing watched lately.' : 'That’s today. See you tomorrow.'}</p>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            Back to Today
          </button>
        </section>
      )}
    </div>
  )
}
