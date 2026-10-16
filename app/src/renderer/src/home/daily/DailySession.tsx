// The daily session: a line said back, then the due cards (capped at about 5 minutes, reviewed with
// the flashcards' cards), then one challenge (recall a word, what a line meant, or the line's words in
// a sentence of one's own), then "done for today" with the streak (kept only when something was done).
// Each step can be skipped; what's in it comes from main (src/main/daily) and the last video watched.
// After a step that was done (not skipped), Duet pops up for a moment with a recorded line
// (cheers.ts) and the session moves on. Each new step takes the focus.
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeToday } from '../../../../shared/home'
import type { SessionView } from '../../../../shared/daily'
import type { CardKind, FlashcardsPrefs } from '../../../../shared/flashcards'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { say } from '../../components/errors'
import { LoadState } from '../../components/LoadState'
import { CountUp, SLIDE } from '../../components/motion'
import { Meaning } from '../../components/challenges/Meaning'
import { Produce } from '../../components/challenges/Produce'
import { Recall } from '../../components/challenges/Recall'
import { SayLine } from '../../components/challenges/SayLine'
import { DuetMascot } from '../../components/duet/DuetMascot'
import type { AnimationCue } from '../../components/duet/conversation'
import type { DuetMood } from '../../components/duet/engine'
import { duetReact } from '../../components/duet/react'
import { playClip, stopVoice } from '../../welcome/voice'
import { Session } from '../flashcards/Session'
import { TODAY_CHANGED } from '../StreakChip'
import { pickCheer, type CheerNext } from './cheers'
import '../flashcards/flashcards.css'
import './daily.css'

type Step = 'say' | 'cards' | 'challenge' | 'done'

function stepsOf(plan: SessionView): Step[] {
  return [
    ...(plan.say ? (['say'] as const) : []),
    ...(plan.cards > 0 ? (['cards'] as const) : []),
    ...(plan.challenge ? (['challenge'] as const) : []),
    'done'
  ]
}

const STEP_NAMES = (plan: SessionView): Record<Exclude<Step, 'done'>, string> => ({
  say: 'Say a line back',
  cards: `Review ${plan.cards} ${plan.cards === 1 ? 'card' : 'cards'}`,
  challenge: 'One challenge'
})

/** Duet, for a moment between steps: a recorded line, then on to the next step. */
function Cheer({
  text,
  done,
  onOver
}: {
  text: string
  done: boolean
  onOver: () => void
}): React.JSX.Element {
  const [speaking, setSpeaking] = useState(true)
  // "All done. See you tomorrow.": surprised for a beat, then happy, with a wink.
  const surprise = done && text.startsWith('All done')
  const [mood, setMood] = useState<DuetMood>(surprise ? 'surprised' : done ? 'proud' : 'correct')
  const [cue, setCue] = useState<AnimationCue>()
  useEffect(() => {
    if (!surprise) return
    const happy = setTimeout(() => setMood('laughing'), 650)
    const wink = setTimeout(() => {
      const now = performance.now()
      setCue({ id: now, gesture: 'wink', priority: 2, until: now + 600 })
    }, 1100)
    return () => {
      clearTimeout(happy)
      clearTimeout(wink)
    }
  }, [surprise])
  const over = useRef(onOver)
  useEffect(() => {
    over.current = onOver
  })
  useEffect(() => {
    let live = true
    const started = performance.now()
    // On to the next step once the line has been said, or after a short beat without sound.
    void playClip('en-US', text).then((played) => {
      if (!live) return
      setSpeaking(false)
      const wait = Math.max(played ? 450 : 0, 1700 - (performance.now() - started))
      setTimeout(() => live && over.current(), wait)
    })
    return () => {
      live = false
      stopVoice()
    }
  }, [text])
  const dark = document.documentElement.classList.contains('theme-dark')
  return (
    <motion.div
      className="today-cheer"
      role="status"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => over.current()}
    >
      <DuetMascot
        state={mood}
        cue={cue}
        speaking={speaking}
        width={84}
        theme={dark ? 'dark' : 'light'}
        watch="off"
        label="Duet"
      />
      <p className="today-cheer-line">{text}</p>
    </motion.div>
  )
}

export function DailySession({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [plan, setPlan] = useState<SessionView>()
  const [planError, setPlanError] = useState<string>()
  const [at, setAt] = useState(0)
  const [result, setResult] = useState<{ kept: boolean; streak: HomeToday['streak'] }>()
  const [doneError, setDoneError] = useState<string>()
  const [cheer, setCheer] = useState<{ text: string; next: CheerNext }>()
  const lastCheer = useRef<string>(undefined)
  const [prefs, setPrefs] = useState<FlashcardsPrefs>()

  // Reaching the end keeps the day (or says why it couldn't); asked from the step that ends it, so once.
  const finish = useCallback(() => {
    setDoneError(undefined)
    window.duet.daily.done().then(
      (done) => {
        setResult(done)
        window.dispatchEvent(new Event(TODAY_CHANGED))
        // Duet cheers when today is kept.
        if (done.kept) duetReact('done')
      },
      (cause) => setDoneError(say(cause, 'Could not record today.'))
    )
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
  // The cards step uses the flashcards' first-time notes ("New card · Gap card…").
  useEffect(() => {
    window.duet.flashcards
      .prefs()
      .then(setPrefs, () => setPrefs({ guideSeen: true, kindsSeen: [] }))
  }, [])
  const onKindSeen = useCallback((kind: CardKind) => {
    setPrefs((now) => {
      if (!now || now.kindsSeen.includes(kind)) return now
      const kindsSeen = [...now.kindsSeen, kind]
      window.duet.flashcards.setPrefs({ kindsSeen }).then(setPrefs, () => undefined)
      return { ...now, kindsSeen }
    })
  }, [])

  const steps = plan ? stepsOf(plan) : []
  const step = steps[at]
  const advance = useCallback(() => {
    if (steps[at + 1] === 'done') finish()
    setAt((index) => index + 1)
  }, [steps, at, finish])
  /** A step ended: done (Duet says something first) or skipped (straight on). */
  const ended = (did: boolean): void => {
    const next = steps[at + 1]
    if (!did || !next) return advance()
    const text = pickCheer(next as CheerNext, lastCheer.current)
    lastCheer.current = text
    setCheer({ text, next: next as CheerNext })
  }
  const cheerOver = useCallback(() => {
    setCheer(undefined)
    advance()
  }, [advance])

  // Each new step (after the first) takes the focus.
  const stepBox = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) stepBox.current?.focus()
    started.current = true
  }, [at])

  if (!plan)
    return (
      <div className="today-load">
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
  const names = STEP_NAMES(plan)
  return (
    <div className="today" ref={stepBox} tabIndex={-1}>
      <header className="today-top">
        {/* A bar for each step: done, this one, still to come (said in words for screen readers). */}
        <ol className="today-steps" aria-hidden="true">
          {steps.slice(0, -1).map((name, index) => (
            <li key={name} className={index < at ? 'is-done' : index === at ? 'is-now' : undefined}>
              <span className="bar">
                <i />
              </span>
              <span className="name">{names[name as Exclude<Step, 'done'>]}</span>
            </li>
          ))}
        </ol>
        <p className="sr-only" role="status">
          {step === 'done'
            ? 'Done'
            : `Step ${at + 1} of ${steps.length - 1}: ${names[step as Exclude<Step, 'done'>]}`}
        </p>
        {step !== 'done' && !cheer && (
          <button type="button" className="today-skip" onClick={advance}>
            Skip
          </button>
        )}
      </header>
      {/* Each step slides in from the right as the last leaves to the left; one that breaks takes only
          itself down, and Skip goes on with the session. */}
      <div className="today-stage">
        <AnimatePresence mode="popLayout" custom={1} initial={false}>
          <motion.div
            key={at}
            className={`today-step is-${step}`}
            custom={1}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="leave"
          >
            {plan.video && (step === 'say' || step === 'challenge') && (
              <p className="today-from">From {plan.video}</p>
            )}
            <ErrorBoundary what="This step">
              {step === 'say' && plan.say && (
                <SayLine line={plan.say} api={window.duet.daily} onNext={ended} />
              )}
              {step === 'cards' && prefs && (
                <div className="fc today-cards">
                  <Session
                    scope={{ kind: 'today', limit: plan.cards }}
                    backTo="Today"
                    kindsSeen={prefs.kindsSeen}
                    onKindSeen={onKindSeen}
                    onBack={() => ended(false)}
                    onAskDuet={() => undefined}
                    onDone={() => ended(true)}
                  />
                </div>
              )}
              {step === 'challenge' && plan.challenge?.kind === 'recall' && (
                <Recall challenge={plan.challenge} api={window.duet.daily} onNext={ended} />
              )}
              {step === 'challenge' && plan.challenge?.kind === 'meaning' && (
                <Meaning challenge={plan.challenge} api={window.duet.daily} onNext={ended} />
              )}
              {step === 'challenge' && plan.challenge?.kind === 'produce' && (
                <Produce challenge={plan.challenge} api={window.duet.daily} onNext={ended} />
              )}
            </ErrorBoundary>
            {step === 'done' && (
              <section className="today-done" aria-label="End of today’s session">
                {result?.kept && (
                  <svg
                    className="today-flame"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="var(--flame-a, #f0582c)"
                      d="M12 2.5c.6 3.1-1.1 4.9-2.7 6.6C7.7 10.8 6 12.6 6 15.3A6 6 0 0 0 12 21.5a6 6 0 0 0 6-6.2c0-2.4-1.1-4.3-2.6-5.7.1 1.6-.5 2.9-1.6 3.4.4-3.9-.6-7.4-1.8-10.5z"
                    />
                    <path
                      fill="var(--flame-core, #ffe0a0)"
                      d="M12.2 13.2c1.6 1.3 2.4 2.6 2.4 3.9A2.6 2.6 0 0 1 12 19.8a2.6 2.6 0 0 1-2.6-2.7c0-1.5 1.1-2.4 2.8-3.9z"
                    />
                  </svg>
                )}
                {result && (
                  <p className="today-days">
                    <CountUp value={result.streak.days} />{' '}
                    {result.streak.days === 1 ? 'day' : 'days'}
                  </p>
                )}
                <p className="today-done-line">
                  {!result
                    ? doneError
                      ? ''
                      : 'Keeping today…'
                    : steps.length === 1
                      ? 'You’re all caught up: nothing due, and nothing watched lately.'
                      : !result.kept
                        ? 'Nothing done this time, so today isn’t kept yet. Do one step, or watch 10 minutes.'
                        : 'Done for today. See you tomorrow.'}
                </p>
                {doneError && (
                  <p className="notice error row" role="alert">
                    <span>{doneError}</span>
                    <button type="button" className="btn quiet" onClick={finish}>
                      Try again
                    </button>
                  </p>
                )}
                <button type="button" className="today-home" onClick={onClose}>
                  Back to Home
                </button>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {cheer && (
            <Cheer
              key={cheer.text}
              text={cheer.text}
              done={cheer.next === 'done'}
              onOver={cheerOver}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
