// Round four: C1 on its Corner seat, with the talking pill and the checkpoint taken further. Three
// talking pills × listening / thinking / speaking, and three checkpoint offers × offered / open / done.
// The real mascot (DuetMascot); mock markup otherwise, nothing here is the app's overlay code.
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'
import type { DuetMood } from '../../src/renderer/src/components/duet/engine'

type Talk = 'listening' | 'thinking' | 'speaking'
type TalkLook = 'pill' | 'level' | 'bubble'
type Offer = 'glow' | 'ladder' | 'tile'
type Step = 'offered' | 'open' | 'done'

const TALK_MOOD: Record<Talk, DuetMood> = { listening: 'listening', thinking: 'thinking', speaking: 'speaking' }
const TALK_WORD: Record<Talk, string> = { listening: 'Listening', thinking: 'Thinking', speaking: 'Duet' }
const HEARD = 'How do I say “I overslept”?'
const SAID = (
  <>
    <b lang="es">Me quedé dormido.</b> Try it — say it back to me.
  </>
)

function Face({ mood, size = 30, speaking }: { mood: DuetMood; size?: number; speaking?: boolean }): React.JSX.Element {
  return <DuetMascot state={mood} width={size} finish="flat" theme="dark" watch="off" speaking={speaking} label="Duet" />
}

function Line(): React.JSX.Element {
  return (
    <p className="mix" lang="es">
      <span className="w">I have to</span> <span className="w sw" data-k="seen">madrugar</span>{' '}
      <span className="w sw" data-k="known">mañana</span>
      <span className="w">, so</span> <span className="w sw" data-k="say">vámonos</span>
      <span className="w">.</span>
    </p>
  )
}

/** Five bars that move with the learner's voice while Duet listens (still otherwise). */
function Level({ live }: { live: boolean }): React.JSX.Element {
  return (
    <span className={`level-bars${live ? ' live' : ''}`} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  )
}

function TalkStrip({ look, talk }: { look: TalkLook; talk: Talk }): React.JSX.Element {
  const subtitles = look !== 'bubble'
  return (
    <div className={`dock c1 seat-corner talking-${look}`}>
      {subtitles && (
        <div className="talk-lines">
          <p className="heard">{HEARD}</p>
          {talk === 'speaking' && <p className="said">{SAID}</p>}
        </div>
      )}
      <div className="strip">
        {look === 'pill' && (
          <button className="perch tile talking">
            <span className="tile-face"><Face mood={TALK_MOOD[talk]} speaking={talk === 'speaking'} /></span>
            <span className="tile-label">{TALK_WORD[talk]}</span>
            <span className="tile-end">End</span>
          </button>
        )}
        {look === 'level' && (
          <span className="perch tile talking level-pill">
            <span className="tile-face"><Face mood={TALK_MOOD[talk]} speaking={talk === 'speaking'} /></span>
            {talk === 'thinking' ? <span className="dots" aria-label="Thinking"><i /><i /><i /></span> : <Level live={talk === 'listening'} />}
            <button className="type" title="Type instead">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1.5" y="4" width="13" height="8" rx="2" /><path d="M4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6" /></svg>
            </button>
            <button className="end" title="End">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
            </button>
          </span>
        )}
        {look === 'bubble' && (
          <span className="perch tile talking bubble-wrap">
            <span className="tile-face"><Face mood={TALK_MOOD[talk]} speaking={talk === 'speaking'} /></span>
            <span className="speech">
              <span className="speech-heard">{HEARD}</span>
              {talk === 'thinking' && <span className="dots"><i /><i /><i /></span>}
              {talk === 'speaking' && <span className="speech-said">{SAID}</span>}
              {talk === 'listening' && <span className="speech-hint">Listening…</span>}
              <span className="speech-actions"><span>Type instead</span><span>End</span></span>
            </span>
          </span>
        )}
        <div className="body"><Line /></div>
      </div>
    </div>
  )
}

function Checkpoint(): React.JSX.Element {
  return (
    <div className="checkpoint">
      <p className="ask"><span className="kicker">Quick one</span>What does <b data-k="seen">madrugar</b> mean?</p>
      <div className="choices">
        <span className="choice">to stay up late</span>
        <span className="choice right">to get up early</span>
        <span className="choice">to oversleep</span>
      </div>
    </div>
  )
}

function OfferStrip({ offer, step }: { offer: Offer; step: Step }): React.JSX.Element {
  const mood: DuetMood = step === 'done' ? 'correct' : 'curious'
  const glowing = step !== 'done'
  return (
    <div className={`dock c1 seat-corner offer-${offer} step-${step}`}>
      <div className={`strip-row${step === 'open' ? ' asking' : ''}`}>
        {/* The light goes round the whole shape: the strip, and the card on it when open. */}
        {glowing && offer !== 'tile' && (
          <span className="glow" aria-hidden="true"><i /><i /><i /></span>
        )}
        {/* Duet sits on the shape's top corner: the strip's, or the open card's. */}
        <button className="perch tile cp-perch">
          <span className="tile-face"><Face mood={mood} /></span>
          {offer === 'tile' && step === 'offered' && <span className="badge" aria-label="A checkpoint is waiting" />}
        </button>
        {step === 'open' && <Checkpoint />}
        <div className="strip">
          <button className="perch tile" hidden>
            <span className="tile-face"><Face mood={mood} /></span>
            {offer === 'tile' && step === 'offered' && <span className="badge" aria-label="A checkpoint is waiting" />}
          </button>
          <div className="body">
            {step === 'done' ? (
              <p className="done-line"><span className="tick">✓</span> Got it — <b data-k="known">madrugar</b> moved up to <span className="rung-word">known</span></p>
            ) : (
              <Line />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Scene({ caption, children }: { caption: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <figure>
      <div className="scene">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

function Section(props: { tag: string; name: string; why: string; notes: string[]; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="version tall">
      <div>
        <span className="tag">{props.tag}</span>
        <h2 className="serif">{props.name}</h2>
        <p className="why">{props.why}</p>
        <ul>{props.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
      <div className="scenes cols-3">{props.children}</div>
    </section>
  )
}

const TALKS: Talk[] = ['listening', 'thinking', 'speaking']
const STEPS: Step[] = ['offered', 'open', 'done']
const STEP_LABEL: Record<Step, string> = { offered: 'Offered', open: 'Pointed at — the question grows out of the strip', done: 'Answered — folds back, Duet pleased' }

function Canvas(): React.JSX.Element {
  return (
    <>
      <header>
        <h1 className="serif"><span className="brushed">Talking</span> and checkpoints</h1>
        <p>
          The Corner seat, kept. Three ways for the tile to open while you talk to Duet, each shown listening,
          thinking and speaking; then three ways to offer a checkpoint, each offered, open and answered. There is
          only ever one Duet on screen.
        </p>
      </header>
      <main>
        <Section tag="T1" name="Pill" why="Round three’s pill: Duet, a word for what it is doing, and End. What was heard and said shows above the strip as small subtitles, as today."
          notes={['Simplest; reads at a glance', 'The word changes: Listening · Thinking · Duet', 'End where the finger already is']}>
          {TALKS.map((t) => <Scene key={t} caption={t[0].toUpperCase() + t.slice(1)}><TalkStrip look="pill" talk={t} /></Scene>)}
        </Section>
        <Section tag="T2" name="Voice pill" why="No words in the pill: your voice as five bars while Duet listens, three dots while it thinks, and two quiet icons — type instead, end. Subtitles above, as T1."
          notes={['Shows Duet can hear you — the bars move with your voice', 'Type instead is one tap, not a menu', 'Smallest; icon-only needs tooltips']}>
          {TALKS.map((t) => <Scene key={t} caption={t[0].toUpperCase() + t.slice(1)}><TalkStrip look="level" talk={t} /></Scene>)}
        </Section>
        <Section tag="T3" name="Speech bubble" why="The tile grows a speech bubble up and to the right, as the home bar’s face turns into a bubble: what you said, then Duet’s answer, inside it. Nothing floats over the video."
          notes={['Ties to the home bar’s talk bubble', 'Readable over any scene — it sits on ink', 'Taller; covers more of the picture while it’s up']}>
          {TALKS.map((t) => <Scene key={t} caption={t[0].toUpperCase() + t.slice(1)}><TalkStrip look="bubble" talk={t} /></Scene>)}
        </Section>

        <Section tag="K1" name="Flowing light" why="Today’s offer: the Apple-Intelligence light flows round the strip and the tile, and pointing at the strip opens the question out of it. Duet looks curious."
          notes={['Kept from today’s overlay', 'Loudest; its colours aren’t Duet’s own', 'The open card sits flush on the strip, one shape']}>
          {STEPS.map((s) => <Scene key={s} caption={STEP_LABEL[s]}><OfferStrip offer="glow" step={s} /></Scene>)}
        </Section>
        <Section tag="K2" name="Ladder light" why="The same flowing light, but in the knowledge ladder’s colours — yellow, orange, blue, green — the only colours Duet uses for words. A checkpoint is a word climbing, so the light says so."
          notes={['On brand: Duet’s colours, not Apple’s', 'Softer: two layers, slower', 'Same opening as K1']}>
          {STEPS.map((s) => <Scene key={s} caption={STEP_LABEL[s]}><OfferStrip offer="ladder" step={s} /></Scene>)}
        </Section>
        <Section tag="K3" name="Duet asks" why="The strip stays calm. Only the tile changes: a soft ladder ring and a small dot, Duet curious. Pointing at Duet (not the whole strip) opens the question."
          notes={['Quietest — nothing crosses the subtitles', 'Easy to miss when you’re watching closely', 'Fits “neutral until pressed” best: the ask is Duet’s']}>
          {STEPS.map((s) => <Scene key={s} caption={STEP_LABEL[s]}><OfferStrip offer="tile" step={s} /></Scene>)}
        </Section>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
