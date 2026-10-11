// The daily session: the due cards (capped at about 5 minutes), then a line said back, then one
// challenge (recall a word, what a line meant, or use the line's words in a sentence of one's own),
// then "done for today" with the streak (kept only when something was done). Each step can be
// skipped; what's in it comes from main (src/main/daily) and the last video watched. Each new step
// takes the focus, so the keyboard and a screen reader follow along.
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeToday } from '../../../../shared/home'
import type { SessionView } from '../../../../shared/daily'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { say } from '../../components/errors'
import { LoadState } from '../../components/LoadState'
import { CountUp, SLIDE } from '../../components/motion'
import { Review } from '../../review/Review'
import { Meaning } from '../../components/challenges/Meaning'
import { Produce } from '../../components/challenges/Produce'
import { Recall } from '../../components/challenges/Recall'
import { SayLine } from '../../components/challenges/SayLine'

type Step = 'cards' | 'say' | 'challenge' | 'done'

function stepsOf(plan: SessionView): Step[] {
  return [...(plan.cards > 0 ? (['cards'] as const) : []), ...(plan.say ? (['say'] as const) : []), ...(plan.challenge ? (['challenge'] as const) : []), 'done']
}

export function DailySession({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [plan, setPlan] = useState<SessionView>()
  const [planError, setPlanError] = useState<string>()
  const [at, setAt] = useState(0)
  const [result, setResult] = useState<{ kept: boolean; streak: HomeToday['streak'] }>()
  const [doneError, setDoneError] = useState<string>()
  // Reaching the end keeps the day (or says why it couldn't); asked from the step that ends it, so once.
  const finish = useCallback(() => {
    setDoneError(undefined)
    window.duet.daily.done().then(setResult, (cause) => setDoneError(say(cause, 'Could not record today.')))
  }, [])
  const loadPlan = useCallback(() => {
    window.duet.daily.plan().then(
      (next) => {
        setPlan(next)
        // Nothing to do today: the session is over as it starts.
        if (stepsOf(next).length === 1) finish()
      },
      (cause) => setPlanError(say(cause, 'Today’s session could not start.'))
    )
  }, [finish])
  useEffect(() => loadPlan(), [loadPlan])
  const steps = plan ? stepsOf(plan) : []
  const step = steps[at]
  const next = (): void => {
    if (steps[at + 1] === 'done') finish()
    setAt((index) => index + 1)
  }
  // Each new step (after the first) takes the focus.
  const stepBox = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) stepBox.current?.focus()
    started.current = true
  }, [at])

  if (!plan)
    return (
      <div className="row">
        <LoadState
          loaded={false}
          error={planError}
          reload={() => {
            setPlanError(undefined)
            loadPlan()
          }}
        />
        {planError && (
          <button type="button" className="btn quiet" onClick={onClose}>
            Back
          </button>
        )}
      </div>
    )
  return (
    <div className="daily" ref={stepBox} tabIndex={-1}>
      <p className="faint daily-progress" role="status">
        {step === 'done' ? 'Done' : `Step ${at + 1} of ${steps.length - 1}`}
        {plan.video && step !== 'cards' && step !== 'done' && ` · from ${plan.video}`}
      </p>
      {/* Each step slides in from the right as the last leaves to the left; one that breaks takes
          only itself down, and Skip goes on with the session. */}
      <AnimatePresence mode="wait" custom={1} initial={false}>
      <motion.div key={at} className="daily-step" custom={1} variants={SLIDE} initial="enter" animate="center" exit="leave">
      <ErrorBoundary what="This step">
        {step === 'cards' && <Review limit={plan.cards} onEnd={next} />}
        {step === 'say' && plan.say && <SayLine line={plan.say} api={window.duet.daily} onNext={next} />}
        {step === 'challenge' && plan.challenge?.kind === 'recall' && <Recall challenge={plan.challenge} api={window.duet.daily} onNext={next} />}
        {step === 'challenge' && plan.challenge?.kind === 'meaning' && <Meaning challenge={plan.challenge} api={window.duet.daily} onNext={next} />}
        {step === 'challenge' && plan.challenge?.kind === 'produce' && <Produce challenge={plan.challenge} api={window.duet.daily} onNext={next} />}
      </ErrorBoundary>
      {step === 'done' && (
        <section className="glass" aria-label="End of today’s session">
          <span className="label">{!result ? 'Today’s session' : result.kept ? 'Done for today' : 'Session over'}</span>
          {result && (
            <p className="home-number">
              <CountUp value={result.streak.days} /> {result.streak.days === 1 ? 'day' : 'days'}
            </p>
          )}
          <p className="muted">
            {!result
              ? doneError
                ? ''
                : 'Keeping today…'
              : steps.length === 1
                ? 'You’re all caught up: nothing due, and nothing watched lately.'
                : !result.kept
                  ? 'Nothing done this time, so today isn’t kept yet. Do one step, or watch 10 minutes.'
                  : 'That’s today. See you tomorrow.'}
          </p>
          {doneError && (
            <p className="notice error row" role="alert">
              <span>{doneError}</span>
              <button type="button" className="btn quiet" onClick={finish}>
                Try again
              </button>
            </p>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            Back to Home
          </button>
        </section>
      )}
      </motion.div>
      </AnimatePresence>
    </div>
  )
}
