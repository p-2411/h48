// C4, Duet's tile inside the strip, taken further: talking (two ways), its face as the status, and
// checkpoints (two ways). The real mascot (DuetMascot); mock markup otherwise, nothing here is the
// app's overlay code. Type: Inter for the strip and controls, Source Serif 4 only for what Duet says
// at 20px and up (docs/brand/typography.md).
// Styles go through Vite (not <link>), so an edit is never served from a stale cache.
import '../caption-v2/caption-v2.css'
import './c4.css'
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'
import type { DuetMood } from '../../src/renderer/src/components/duet/engine'

type Talk = 'listening' | 'thinking' | 'speaking'
type Step = 'offered' | 'open' | 'done'

const HEARD = 'How do I say “I overslept”?'

function Face({ mood, speaking, wake }: { mood: DuetMood; speaking?: boolean; wake?: boolean }): React.JSX.Element {
  return <DuetMascot state={mood} width={30} finish="flat" theme="dark" watch={speaking ? 'off' : 'near'} speaking={speaking} wake={wake} label="Duet" />
}

function Tile({ mood, speaking, wake, extra, title = 'Talk to Duet' }: { mood: DuetMood; speaking?: boolean; wake?: boolean; extra?: string; title?: string }): React.JSX.Element {
  return (
    <button className={`perch inside${extra ? ` ${extra}` : ''}`} title={title}>
      <span className="tile-face"><Face mood={mood} speaking={speaking} wake={wake} /></span>
    </button>
  )
}

function Line({ quiet }: { quiet?: boolean }): React.JSX.Element {
  return (
    <p className={`mix${quiet ? ' quiet' : ''}`} lang="es">
      <span className="w">I have to</span> <span className="w sw" data-k="seen">madrugar</span>{' '}
      <span className="w sw" data-k="known">mañana</span>
      <span className="w">, so</span> <span className="w sw" data-k="say">vámonos</span>
      <span className="w">.</span>
    </p>
  )
}

function Dots(): React.JSX.Element {
  return <span className="dots" aria-label="Thinking"><i /><i /><i /></span>
}

function Bars({ live }: { live: boolean }): React.JSX.Element {
  return <span className={`bars${live ? ' live' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>
}

const MOOD: Record<Talk, DuetMood> = { listening: 'listening', thinking: 'thinking', speaking: 'speaking' }

/** TA: the strip itself becomes the conversation; the video's line waits, small, above it. */
function TalkInStrip({ talk }: { talk: Talk }): React.JSX.Element {
  return (
    <div className="dock perch-inside c4 talk-in">
      <div className="paused-line"><svg className="pause" viewBox="0 0 8 8" aria-label="Paused"><rect x="1" y="1" width="2" height="6" rx="0.6" /><rect x="5" y="1" width="2" height="6" rx="0.6" /></svg> <Line quiet /></div>
      <div className="strip">
        <Tile mood={MOOD[talk]} speaking={talk === 'speaking'} title="End talking" />
        <div className="body convo">
          {talk === 'listening' && (
            <>
              <p className="you">{HEARD}</p>
              <p className="state"><Bars live /> Listening</p>
            </>
          )}
          {talk === 'thinking' && (
            <>
              <p className="you">{HEARD}</p>
              <p className="state"><Dots /></p>
            </>
          )}
          {talk === 'speaking' && (
            <>
              <p className="you small">{HEARD}</p>
              <p className="duet-says" lang="es">Me quedé dormido.</p>
              <p className="duet-aside">Try it — say it back to me.</p>
            </>
          )}
        </div>
        <span className="strip-end">
          <button className="mini" title="Type instead">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1.5" y="4" width="13" height="8" rx="2" /><path d="M4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6" /></svg>
          </button>
          <button className="mini end">End</button>
        </span>
      </div>
    </div>
  )
}

/** TB: a talk card grows up out of the strip (one shape); Duet moves up into it; the line stays. */
function TalkCard({ talk }: { talk: Talk }): React.JSX.Element {
  return (
    <div className="dock perch-inside c4 talk-card">
      <div className="strip-row">
        <div className="grown">
          <Tile mood={MOOD[talk]} speaking={talk === 'speaking'} title="End talking" />
          <div className="convo">
            <p className="you">{HEARD}</p>
            {talk === 'listening' && <p className="state"><Bars live /> Listening</p>}
            {talk === 'thinking' && <p className="state"><Dots /></p>}
            {talk === 'speaking' && (
              <>
                <p className="duet-says" lang="es">Me quedé dormido.</p>
                <p className="duet-aside">Try it — say it back to me.</p>
              </>
            )}
          </div>
          <span className="strip-end top">
            <button className="mini" title="Type instead">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1.5" y="4" width="13" height="8" rx="2" /><path d="M4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6" /></svg>
            </button>
            <button className="mini end">End</button>
          </span>
        </div>
        <div className="strip joined">
          <span className="tile-gap" aria-hidden="true" />
          <div className="body"><Line /></div>
        </div>
      </div>
    </div>
  )
}

function StatusStrip({ mood, idle, tip }: { mood: DuetMood; idle?: boolean; tip?: string }): React.JSX.Element {
  return (
    <div className="dock perch-inside c4">
      <div className="strip">
        <Tile mood={mood} extra={tip ? 'pointed' : undefined} />
        {tip && <span className="tip">{tip}</span>}
        <div className="body">{idle ? <p className="idle">Lines appear here as they are spoken</p> : <Line />}</div>
      </div>
    </div>
  )
}

function Question(): React.JSX.Element {
  return (
    <div className="convo">
      <p className="duet-says">What does <b data-k="seen">madrugar</b> mean?</p>
      <div className="choices">
        <span className="choice">to stay up late</span>
        <span className="choice right">to get up early</span>
        <span className="choice">to oversleep</span>
      </div>
    </div>
  )
}

/** KA: ladder light round the strip; open, the question grows out of it and Duet moves up to ask. */
function OfferLight({ step }: { step: Step }): React.JSX.Element {
  return (
    <div className={`dock perch-inside c4 offer-light step-${step}`}>
      <div className="strip-row">
        {step !== 'done' && <span className="glow" aria-hidden="true"><i /><i /></span>}
        {step === 'open' && (
          <div className="grown">
            <Tile mood="curious" title="Duet’s question" />
            <Question />
          </div>
        )}
        <div className={`strip${step === 'open' ? ' joined' : ''}`}>
          {step === 'open' ? <span className="tile-gap" aria-hidden="true" /> : <Tile mood={step === 'done' ? 'correct' : 'curious'} />}
          <div className="body">
            {step === 'done' ? <Done /> : <Line />}
          </div>
        </div>
      </div>
    </div>
  )
}

/** KB: the strip stays calm; Duet's tile rings in the ladder colours and a quiet “Quick one?” waits
 * at the strip's end. Pressing either asks, in the strip itself. */
function OfferAsk({ step }: { step: Step }): React.JSX.Element {
  return (
    <div className={`dock perch-inside c4 offer-ask step-${step}`}>
      <div className="strip">
        <Tile mood={step === 'done' ? 'correct' : 'curious'} extra={step === 'offered' ? 'ringing' : undefined} />
        <div className="body">
          {step === 'offered' && <Line />}
          {step === 'open' && <Question />}
          {step === 'done' && <Done />}
        </div>
        {step === 'offered' && <span className="strip-end"><button className="mini ask">Quick one?</button></span>}
        {step === 'open' && <span className="strip-end"><button className="mini">Later</button></span>}
      </div>
    </div>
  )
}

function Done(): React.JSX.Element {
  return (
    <p className="done-line"><span className="tick">✓</span> Got it — <b data-k="known">madrugar</b> moved up to <span className="rung-word">known</span></p>
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

function Section(props: { tag: string; name: string; why: string; notes: string[]; cols?: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="version">
      <div>
        <span className="tag">{props.tag}</span>
        <h2 className="serif">{props.name}</h2>
        <p className="why">{props.why}</p>
        <ul>{props.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
      <div className={`scenes cols-${props.cols ?? 3}`}>{props.children}</div>
    </section>
  )
}

const TALKS: Talk[] = ['listening', 'thinking', 'speaking']
const STEPS: Step[] = ['offered', 'open', 'done']
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1)
const STEP_LABEL: Record<Step, string> = { offered: 'Offered', open: 'Open — Duet asks', done: 'Answered — Duet pleased' }

function Canvas(): React.JSX.Element {
  return (
    <>
      <header>
        <h1 className="serif"><span className="brushed">Inside</span> the strip</h1>
        <p>
          C4 taken further: Duet’s tile lives in the strip, by the line. Two ways to talk to it, its face as the
          status, and two ways for it to offer a checkpoint. What Duet says is set in Source Serif 4; the strip and
          its controls stay Inter. Duet is the real mascot: neutral until pressed, watching the pointer only when it
          comes near.
        </p>
      </header>
      <main>
        <Section tag="TA" name="The strip becomes the talk"
          why="Pressed, the strip is the conversation: what you asked, then Duet’s answer in its own voice. The video’s line steps up, small and paused, so you don’t lose your place."
          notes={['One place to look: nothing floats over the video', 'Duet’s answer in serif — its voice; your words in Inter', 'Type instead and End at the strip’s end; pressing Duet ends too']}>
          {TALKS.map((t) => <Scene key={t} caption={cap(t)}><TalkInStrip talk={t} /></Scene>)}
        </Section>
        <Section tag="TB" name="A talk card grows out"
          why="The line stays where it is. A card grows up out of the strip as one shape — the same move as a checkpoint — and Duet moves up into it to talk; its place in the strip stays open."
          notes={['Subtitles keep running underneath', 'Same shape as the checkpoint card: one pattern to learn', 'Taller while it’s up']}>
          {TALKS.map((t) => <Scene key={t} caption={cap(t)}><TalkCard talk={t} /></Scene>)}
        </Section>

        <Section tag="S" name="Its face is the status" cols={3}
          why="The dot’s job, in Duet’s own moods, with the words on pointing at it. Inside the strip, the face sits right next to the line it’s talking about."
          notes={['Idle · thinking · confused · asleep', 'Confused before a press bends “neutral until pressed”; idle + the words is the strict option', 'Pointed at: what pressing does, and the status']}>
          <Scene caption="Lines coming through · idle"><StatusStrip mood="idle" /></Scene>
          <Scene caption="A line translating · thinking"><StatusStrip mood="thinking" /></Scene>
          <Scene caption="Something is wrong · confused"><StatusStrip mood="confused" /></Scene>
          <Scene caption="Nothing playing · asleep"><StatusStrip mood="asleep" idle /></Scene>
          <Scene caption="Pointed at"><StatusStrip mood="idle" tip="Talk to Duet · Lines coming through" /></Scene>
        </Section>

        <Section tag="KA" name="Ladder light"
          why="The flowing light, in the word-ladder colours, round the strip. Pointing at it grows the question up out of the strip, and Duet moves up to ask it — in its own voice."
          notes={['A checkpoint is a word climbing: the light says so', 'The open card and strip are one shape; the light goes round both', 'Answered: folds back, Duet pleased, the word’s new rung in its colour']}>
          {STEPS.map((s) => <Scene key={s} caption={STEP_LABEL[s]}><OfferLight step={s} /></Scene>)}
        </Section>
        <Section tag="KB" name="Duet asks, in the strip"
          why="Nothing glows over the video. Duet’s tile rings softly in the ladder colours and a quiet “Quick one?” waits just above the strip’s end. Pressing either asks the question right in the strip, then the line comes back."
          notes={['Quietest; nothing crosses the picture', 'The ask is Duet’s — fits “neutral until pressed”', '“Later” puts it off; the line returns after answering']}>
          {STEPS.map((s) => <Scene key={s} caption={STEP_LABEL[s]}><OfferAsk step={s} /></Scene>)}
        </Section>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
