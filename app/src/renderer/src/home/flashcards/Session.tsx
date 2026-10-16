// A review on the flashcards page: one card at a time, each asking one thing, each ending with Forgot
// or Got it (Duet works out how hard it was from the time taken, replays and how a spoken answer
// went). Showing the answer opens the same card; answering puts it away and deals the next; Undo
// (or ←) brings the last one back. The end is Duet, pleased, and a little paper.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  cardKey,
  KIND_NAMES,
  KIND_NOTES,
  STEP_LABELS,
  type CardKind,
  type FlashcardView,
  type SessionScope,
  type SessionState,
  type SpokenCheck,
  mmss
} from '../../../../shared/flashcards'
import { say } from '../../components/errors'
import { useRecorder } from '../../components/challenges/useRecorder'
import { MicButton } from '../../components/MicButton'
import { DuetMascot } from '../../components/duet/DuetMascot'
import { Bolded, Entry, StepDot } from './Entry'
import { confetti, icons, playClip } from './bits'
import type { SessionApi } from './sample'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
// How long the answered card takes to be put away before the next is dealt.
const LEAVE_MS = 170
const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/** The card's top line: its step, and where it's from. */
function StepRow({ view }: { view: FlashcardView }): React.JSX.Element {
  const from = view.lastHeard
    ? [view.lastHeard.video, mmss(view.lastHeard.at)].filter(Boolean).join(' · ')
    : view.card.source.kind === 'video'
      ? undefined
      : 'Made by you'
  return (
    <span className="fc-step" data-step={view.step}>
      <StepDot step={view.step} />
      {STEP_LABELS[view.step]}
      {from && <span className="src">{from}</span>}
    </span>
  )
}

/** A gap card's or a use-it card's answer: said (the mic) or typed. */
function SayOrType({
  label,
  placeholder,
  onSaid,
  onTyped,
  busy
}: {
  label: string
  placeholder: string
  onSaid: (wav: Uint8Array) => void
  onTyped: (text: string) => void
  busy: boolean
}): React.JSX.Element {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const recorder = useRecorder(onSaid)
  return (
    <div className="fc-answer-row">
      {!typing && (
        <>
          <MicButton
            recording={recorder.recording}
            checking={busy}
            level={recorder.level}
            label={
              busy
                ? 'Checking…'
                : recorder.recording
                  ? 'Listening… tap to stop'
                  : 'Tap, then say it'
            }
            ariaLabel={recorder.recording ? 'Stop and check' : label}
            onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
          />
          <button
            type="button"
            className="quiet"
            disabled={busy || recorder.recording}
            onClick={() => setTyping(true)}
          >
            or type it
          </button>
        </>
      )}
      {typing && (
        <form
          className="fc-type"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim()) onTyped(text.trim())
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </form>
      )}
      {recorder.error && <p className="fc-small error">{recorder.error}</p>}
    </div>
  )
}

/** The front: what this card asks. */
function Front({
  view,
  wordRef,
  busy,
  onReveal,
  onSpeak,
  onReplayVideo,
  onSaid,
  onTyped
}: {
  view: FlashcardView
  wordRef: React.Ref<HTMLSpanElement>
  busy: boolean
  onReveal: () => void
  onSpeak: (what: 'word' | 'line', rate?: number) => void
  onReplayVideo: () => void
  onSaid: (wav: Uint8Array) => void
  onTyped: (text: string) => void
}): React.JSX.Element {
  const reveal = (
    <button type="button" className="fc-reveal" onClick={onReveal}>
      Show the answer
    </button>
  )
  const word = (
    <span className="fc-word mark" data-step={view.step} ref={wordRef} style={{ marginTop: 24 }}>
      {view.word}
    </span>
  )
  switch (view.kind) {
    case 'sentence':
      return (
        <>
          <StepRow view={view} />
          {view.line && (
            <div className="fc-clip">
              {view.lastHeard?.replayable && (
                <button
                  type="button"
                  className="play"
                  aria-label={`Play it in ${view.lastHeard.video}`}
                  onClick={onReplayVideo}
                >
                  {icons.play()}
                </button>
              )}
              <div className="sub-line">
                <span>
                  <Bolded line={view.line} />
                </span>
              </div>
            </div>
          )}
          <span className="fc-word mark" data-step={view.step} ref={wordRef}>
            {view.word}
          </span>
          {view.line && (
            <span className="fc-hint">
              <Bolded line={view.line} />
            </span>
          )}
          {reveal}
        </>
      )
    case 'listening':
      return (
        <>
          <StepRow view={view} />
          <button
            type="button"
            className="fc-listen"
            aria-label="Hear the line (double-click: slower)"
            onClick={(event) => event.detail < 2 && onSpeak('line')}
            onDoubleClick={() => onSpeak('line', 0.72)}
          >
            {icons.play(22)}
          </button>
          <div className="fc-hidden-line" aria-hidden="true">
            {(view.line ? `${view.line.before}${view.line.word}${view.line.after}` : view.word)
              .split(/\s+/)
              .filter(Boolean)
              .map((part, index) => (
                <i key={index} style={{ width: Math.min(80, 10 + part.length * 7) }} />
              ))}
          </div>
          <span className="fc-hint" style={{ textAlign: 'center' }}>
            Double-click to hear it slower
          </span>
          {reveal}
        </>
      )
    case 'picture':
      return (
        <>
          <StepRow view={view} />
          {view.picture && <img className="fc-picture" src={view.picture} alt="" />}
          <span className="fc-hint" style={{ textAlign: 'center' }}>
            What’s this called?
          </span>
          {reveal}
        </>
      )
    case 'gap':
      return (
        <>
          <StepRow view={view} />
          {view.line && (
            <span className="fc-line" style={{ marginTop: 20 }}>
              {view.line.before}
              <span className="fc-gap" aria-label="a missing word" />
              {view.line.after}
            </span>
          )}
          {view.line?.translation && <span className="fc-hint">{view.line.translation}</span>}
          <SayOrType
            label="Say the missing word"
            placeholder="The missing word"
            busy={busy}
            onSaid={onSaid}
            onTyped={onTyped}
          />
          <button
            type="button"
            className="quiet"
            style={{ alignSelf: 'center' }}
            onClick={onReveal}
          >
            Show the answer
          </button>
        </>
      )
    case 'use':
      return (
        <>
          <StepRow view={view} />
          <p className="fc-situation" style={{ marginTop: 12 }}>
            {view.situation}
          </p>
          <span className="fc-hint">
            Use <b>{view.word}</b>
          </span>
          <SayOrType
            label={`Say a sentence with ${view.word}`}
            placeholder={`A sentence with ${view.word}`}
            busy={busy}
            onSaid={onSaid}
            onTyped={onTyped}
          />
        </>
      )
    case 'word':
      return (
        <>
          <StepRow view={view} />
          {word}
          {(view.entry?.ipa || view.voice) && (
            <div className="fc-meta">
              {view.entry?.ipa && <span>{view.entry.ipa}</span>}
              {view.voice && (
                <button
                  type="button"
                  className="fc-round"
                  aria-label={`Hear ${view.word}`}
                  onClick={() => onSpeak('word')}
                >
                  {icons.sound}
                </button>
              )}
            </div>
          )}
          {reveal}
        </>
      )
    default:
      return (
        <>
          <StepRow view={view} />
          {word}
          <span className="fc-hint">Still know it?</span>
          {reveal}
        </>
      )
  }
}

/** The end of a review: Duet cheers once, then settles, pleased; a little paper falls. */
function Finish({ title, line }: { title: string; line: string }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [mood, setMood] = useState<'correct' | 'proud'>('correct')
  useEffect(() => {
    const stop = canvas.current ? confetti(canvas.current) : () => {}
    const settle = window.setTimeout(() => setMood('proud'), 2600)
    return () => {
      stop()
      window.clearTimeout(settle)
    }
  }, [])
  const dark = document.documentElement.classList.contains('theme-dark')
  return (
    <div className="fc-session is-finished">
      <canvas ref={canvas} className="fc-confetti" aria-hidden="true" />
      <div className="fc-done" role="status">
        <DuetMascot
          state={mood}
          tone="excited"
          width={150}
          theme={dark ? 'dark' : 'light'}
          watch="near"
          label="Duet, pleased"
        />
        <h2>{title}</h2>
        <p>{line}</p>
      </div>
    </div>
  )
}

/** Inside Today: the cards are done, so Today moves on (once). */
function EndOfCards({ done }: { done: () => void }): React.JSX.Element | null {
  const called = useRef(false)
  useEffect(() => {
    if (called.current) return
    called.current = true
    done()
  }, [done])
  return null
}

export function Session({
  scope,
  backTo,
  kindsSeen,
  onKindSeen,
  onBack,
  onAskDuet,
  onDone,
  api = window.duet.flashcards
}: {
  scope: SessionScope
  /** Where Back goes: "Review", the word, "Collections". */
  backTo: string
  kindsSeen: CardKind[]
  onKindSeen: (kind: CardKind) => void
  onBack: () => void
  onAskDuet: (word: string) => void
  /** Inside Today's session: no Back, and when the cards are done it goes on to the next step. */
  onDone?: () => void
  /** Where the cards come from: the main process, or the tour's sample (sample.ts). */
  api?: SessionApi
}): React.JSX.Element {
  const [state, setState] = useState<SessionState>()
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [enter, setEnter] = useState<'is-deal' | 'is-back' | 'is-revealed'>('is-deal')
  const [leaving, setLeaving] = useState<'got' | 'forgot'>()
  const [said, setSaid] = useState<SpokenCheck>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const root = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const promptWord = useRef<HTMLSpanElement>(null)
  const headword = useRef<HTMLSpanElement>(null)
  const flip = useRef<{ height: number; word?: DOMRect }>(undefined)
  // When the card on screen was shown (set as each card is shown).
  const shownAt = useRef(0)
  const revealMs = useRef(0)
  const replays = useRef(0)
  const clips = useRef(new Map<string, { data: Uint8Array; mimeType: string }>())

  const fresh = (
    next: SessionState,
    move: 'is-deal' | 'is-back',
    showing: 'front' | 'back' = 'front'
  ): void => {
    setState(next)
    setSide(showing)
    setEnter(move)
    setSaid(undefined)
    shownAt.current = performance.now()
    replays.current = 0
  }

  useEffect(() => {
    let live = true
    api.start(scope).then(
      (first) => live && fresh(first, 'is-deal'),
      (cause) => live && setError(say(cause, 'The review could not start.'))
    )
    return () => {
      live = false
    }
    // A new session for each scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scope)])

  const view = state?.next
  const reveal = useCallback(() => {
    if (side !== 'front' || !card.current) return
    flip.current = {
      height: card.current.offsetHeight,
      word: promptWord.current?.getBoundingClientRect()
    }
    revealMs.current = performance.now() - shownAt.current
    setSide('back')
    setEnter('is-revealed')
  }, [side])

  // The reveal: the card grows to the back's height, and the prompt word glides into the headword.
  useLayoutEffect(() => {
    const from = flip.current
    flip.current = undefined
    if (!from || !card.current || reduced()) return
    const element = card.current
    const height = element.offsetHeight
    element.style.overflow = 'hidden'
    element.animate([{ height: `${from.height}px` }, { height: `${height}px` }], {
      duration: 340,
      easing: EASE
    }).onfinish = () => {
      element.style.overflow = ''
    }
    const head = headword.current
    if (from.word && head) {
      const to = head.getBoundingClientRect()
      head.animate(
        [
          {
            transformOrigin: 'left top',
            transform: `translate(${from.word.left - to.left}px, ${from.word.top - to.top}px) scale(${from.word.height / to.height})`
          },
          { transformOrigin: 'left top', transform: 'none' }
        ],
        { duration: 380, easing: EASE }
      )
    }
  }, [side])

  const answer = useCallback(
    async (got: boolean) => {
      if (!view || side !== 'back' || leaving || busy) return
      setLeaving(got ? 'got' : 'forgot')
      setError(undefined)
      if (!kindsSeen.includes(view.kind)) onKindSeen(view.kind)
      const signals = {
        got,
        revealMs: revealMs.current,
        replays: replays.current,
        spoken: said ? (said.good ? ('good' as const) : ('poor' as const)) : undefined
      }
      await new Promise((resolve) => setTimeout(resolve, reduced() ? 0 : LEAVE_MS))
      try {
        fresh(await api.answer(view.card.id, signals), 'is-deal')
      } catch (cause) {
        setError(say(cause, 'That answer could not be saved.'))
        await api.state().then(
          (now) => fresh(now, 'is-deal'),
          () => undefined
        )
      } finally {
        setLeaving(undefined)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, side, leaving, busy, said, kindsSeen, onKindSeen]
  )

  const undo = useCallback(async () => {
    if (!state?.canUndo || busy) return
    setBusy(true)
    setError(undefined)
    try {
      fresh(await api.undo(), 'is-back', 'back')
    } catch (cause) {
      setError(say(cause, 'That answer could not be taken back.'))
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, busy])

  const speak = async (what: 'word' | 'line', rate = 1): Promise<void> => {
    if (!view) return
    replays.current++
    try {
      const id = `${view.card.id}|${what}`
      let clip = clips.current.get(id)
      if (!clip) {
        clip = await api.speak(view.card.id, what)
        clips.current.set(id, clip)
      }
      await playClip(clip, rate)
    } catch (cause) {
      setError(say(cause, 'Duet couldn’t read that out.'))
    }
  }
  const replayVideo = (): void => {
    if (!view) return
    replays.current++
    void api
      .replay(view.card.language, cardKey(view.card))
      .catch((cause) => setError(say(cause, 'That moment couldn’t be played.')))
  }
  const check = async (work: () => Promise<SpokenCheck>): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await work()
      setSaid(result)
      reveal()
    } catch (cause) {
      setError(say(cause, 'That answer couldn’t be checked.'))
    } finally {
      setBusy(false)
    }
  }
  const onSaid = (wav: Uint8Array): void => {
    if (!view) return
    const clip = { data: wav, mimeType: 'audio/wav' }
    void check(() =>
      view.kind === 'use' ? api.checkUse(view.card.id, clip) : api.checkSpoken(view.card.id, clip)
    )
  }
  const onTyped = (text: string): void => {
    if (!view) return
    void check(() =>
      view.kind === 'use' ? api.checkUse(view.card.id, text) : api.checkTyped(view.card.id, text)
    )
  }

  // Keys: Space shows the answer, then is Got it; 1 is Forgot; ← takes the last answer back. Only
  // while this page is the one in front, and never while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (target?.closest('input, textarea, select, [contenteditable="true"], .fc-guide')) return
      const page = root.current
      if (!page || page.closest('[inert]') || !page.offsetParent) return
      if (target && target !== document.body && !page.contains(target)) return
      if (event.key === ' ' || event.key === 'Enter') {
        if (target?.closest('button, summary') && target !== document.body && event.key === 'Enter')
          return
        event.preventDefault()
        if (side === 'front' && view && view.kind !== 'use') reveal()
        else if (side === 'back') void answer(true)
      } else if (event.key === '1' && side === 'back') void answer(false)
      else if (event.key === 'ArrowLeft' && state?.canUndo) {
        event.preventDefault()
        void undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [side, view, state, reveal, answer, undo])

  const back = onDone ? null : (
    <button type="button" className="quiet fc-back" onClick={onBack}>
      {icons.back}
      Back to {backTo}
    </button>
  )

  if (!state)
    return (
      <div className="fc-session" ref={root}>
        {back}
        {error ? <p className="fc-small error">{error}</p> : <p className="fc-small">Loading…</p>}
      </div>
    )

  if (!view && onDone) return <EndOfCards done={onDone} />
  if (!view) {
    const practise = scope.kind === 'practise'
    const title =
      state.done === 0
        ? 'Nothing to review right now.'
        : practise
          ? 'That’s all of them.'
          : 'That’s today’s cards.'
    const line =
      state.done === 0
        ? 'New cards join as you keep words. The rest come back when they need to.'
        : practise
          ? 'Practise doesn’t change when they come back.'
          : state.climbed > 0
            ? `${state.climbed === 1 ? 'One word' : `${state.climbed} words`} climbed a step. The rest come back when they need to.`
            : 'They come back when they need to.'
    return (
      <div className="fc-run" ref={root}>
        <div className="fc-progress">
          <i style={{ width: '100%' }} />
        </div>
        <div style={{ position: 'relative', flexGrow: 1, display: 'flex', minHeight: 0 }}>
          {back}
          {state.done === 0 ? (
            <div className="fc-session is-finished">
              <div className="fc-done">
                <h2 style={{ fontSize: 32 }}>{title}</h2>
                <p>{line}</p>
              </div>
            </div>
          ) : (
            <Finish title={title} line={line} />
          )}
        </div>
      </div>
    )
  }

  const firstTime = !kindsSeen.includes(view.kind)
  const percent = Math.round(
    ((state.done + (side === 'back' ? 0.5 : 0)) / Math.max(1, state.total)) * 100
  )
  const answered = state.answered
  const climbed = answered?.climbed
  return (
    <div className="fc-run" ref={root}>
      <div className="fc-progress">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="fc-session">
        {back}
        <span className="fc-count" style={{ position: 'absolute', top: 18, right: 18 }}>
          {Math.min(state.done + 1, state.total)} of {state.total}
        </span>
        <div className="fc-stage">
          {firstTime && (
            <p className="fc-first">
              <span className="tag">New card</span>
              <span className="txt">
                <b>{KIND_NAMES[view.kind]}.</b> {KIND_NOTES[view.kind]}
              </span>
              <button type="button" onClick={() => onKindSeen(view.kind)}>
                OK
              </button>
            </p>
          )}
          {error && <p className="fc-small error">{error}</p>}
          <div className={`fc-deck${state.done + 1 < state.total ? ' has-more' : ''}`}>
            <article
              data-tour="card"
              key={`${view.card.id}|${enter}|${side === 'front' ? 'f' : 'b'}`}
              ref={card}
              aria-label={view.word}
              className={['fc-card', enter, leaving && `is-leaving-${leaving}`]
                .filter(Boolean)
                .join(' ')}
            >
              {side === 'front' ? (
                <Front
                  view={view}
                  wordRef={promptWord}
                  busy={busy}
                  onReveal={reveal}
                  onSpeak={(what, rate) => void speak(what, rate)}
                  onReplayVideo={replayVideo}
                  onSaid={onSaid}
                  onTyped={onTyped}
                />
              ) : (
                <>
                  {said && (
                    <div className="fc-yours">
                      <span className="said">“{said.heard}”</span>
                      <span className="verdict">{said.note}</span>
                    </div>
                  )}
                  <Entry
                    data={{ ...view, byDuet: view.card.example?.byDuet }}
                    headRef={headword}
                    onSound={view.voice ? () => void speak('word') : undefined}
                    onReplay={view.lastHeard?.replayable ? replayVideo : undefined}
                  />
                  <div className="fc-answers">
                    <button
                      type="button"
                      className="forgot"
                      onClick={() => void answer(false)}
                      title="Forgot (1)"
                    >
                      Forgot
                    </button>
                    <button
                      type="button"
                      className="got"
                      onClick={() => void answer(true)}
                      title="Got it (Space)"
                    >
                      Got it
                    </button>
                  </div>
                </>
              )}
            </article>
          </div>
        </div>
      </div>
      <div className="fc-foot">
        {state.canUndo && (
          <button
            type="button"
            className="quiet"
            onClick={() => void undo()}
            title="Back to the last card (←)"
          >
            <kbd aria-hidden="true">←</kbd>
            Undo
          </button>
        )}
        <span className="grow" />
        {answered?.comesBack && (
          <span className="fc-climbed" key={`${answered.word}|${state.done}`} role="status">
            <b className={climbed ? 'mark' : undefined} data-step={climbed}>
              {answered.word}
            </b>
            {climbed ? `is ${STEP_LABELS[climbed]} now, and ` : ''}comes back {answered.comesBack}
          </span>
        )}
        <span className="grow" />
        <button type="button" className="quiet" onClick={() => onAskDuet(view.word)}>
          Ask Duet
        </button>
      </div>
    </div>
  )
}
