// Round three of the caption window: C1, Duet's face tile on the strip's corner, refined — where the
// tile sits, what it does when reached for and while talking, how it lives with the word card, the
// status, a checkpoint, and the awkward cases. The real mascot (DuetMascot); mock markup otherwise,
// nothing here is the app's overlay code.
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'
import type { DuetMood } from '../../src/renderer/src/components/duet/engine'

type Seat = 'corner' | 'shelf' | 'badge'
type Line = 'mixed' | 'long' | 'short' | 'idle'

const LINES: Record<Exclude<Line, 'idle'>, React.ReactNode> = {
  mixed: (
    <>
      <span className="w">I have to</span> <span className="w sw" data-k="seen">madrugar</span>{' '}
      <span className="w sw" data-k="known">mañana</span>
      <span className="w">, so</span> <span className="w sw" data-k="say">vámonos</span>
      <span className="w">.</span>
    </>
  ),
  long: (
    <>
      <span className="w">If we don't</span> <span className="w sw" data-k="seen">madrugar</span>{' '}
      <span className="w">we'll miss the</span> <span className="w sw" data-k="unknown">tren</span>{' '}
      <span className="w">and my</span> <span className="w sw" data-k="known">abuela</span>{' '}
      <span className="w">will be waiting at the station all</span> <span className="w sw" data-k="say">mañana</span>
      <span className="w">.</span>
    </>
  ),
  short: (
    <>
      <span className="w sw" data-k="say">¡Vámonos!</span>
    </>
  )
}

type StripProps = {
  seat?: Seat
  mood?: DuetMood
  line?: Line
  /** What the strip is showing around the line. */
  show?: 'rest' | 'hover' | 'word' | 'duet' | 'talking' | 'speaking' | 'offer'
  status?: string
  wake?: boolean
}

function Strip({ seat = 'corner', mood = 'idle', line = 'mixed', show = 'rest', status = 'Lines coming through', wake }: StripProps): React.JSX.Element {
  const talking = show === 'talking' || show === 'speaking'
  const classes = ['dock', 'c1', `seat-${seat}`, `show-${show}`]
  if (show === 'hover' || show === 'word') classes.push('pinned')
  if (show === 'word') classes.push('card-open')
  return (
    <div className={classes.join(' ')}>
      {talking && (
        <div className="talk-lines">
          <p className="heard">How do I say “I overslept”?</p>
          {show === 'speaking' && <p className="said" lang="es">Me quedé dormido. Try it: <b>me quedé dormido</b>.</p>}
        </div>
      )}
      <div className="actions">
        <span className="level">2</span>
        <span className="spacer" />
        <button className="act primary">Explain</button>
        <button className="act icon" title="Save line">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></svg>
        </button>
        <button className="act icon" title="Replay">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" /></svg>
        </button>
        <button className="act icon" title="Settings">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></svg>
        </button>
      </div>
      <div className="card" data-k="seen">
        <span className="labels"><span className="job">Verb</span><span className="rung">Heard 4 times</span></span>
        <b className="head" data-k="seen">madrugar</b>
        <span className="reading">ma·dru·GAR</span>
        <span>to get up early</span>
        <span className="row">
          <button className="pill on">★ Saved</button>
          <button className="pill">Explain line</button>
          <button className="pill">Ignore</button>
        </span>
      </div>
      <div className="strip">
        {show === 'offer' && (
          <span className="glow" aria-hidden="true"><i /><i /><i /></span>
        )}
        <button className={`perch tile${talking ? ' talking' : ''}`} title={`Talk to Duet · ${status}`}>
          <span className="tile-face">
            <DuetMascot state={mood} width={30} finish="flat" theme="dark" watch={talking ? 'off' : 'near'} speaking={show === 'speaking'} wake={wake} label="Duet" />
          </span>
          {talking && <span className="tile-label">{show === 'speaking' ? 'Duet' : 'Listening'}</span>}
          {talking && <span className="tile-end">End</span>}
          {show === 'duet' && <span className="tip">Talk to Duet <span>· {status}</span></span>}
        </button>
        <div className="body">
          {line === 'idle' ? (
            <p className="idle">Lines appear here as they are spoken</p>
          ) : (
            <p className="mix" lang="es">{LINES[line]}</p>
          )}
          <div className="more"><div>
            <span className="pad" />
            <p className="source" lang="es">Mañana tengo que madrugar, así que vámonos.</p>
            <p className="english">I have to get up early tomorrow, so let's go.</p>
          </div></div>
        </div>
      </div>
    </div>
  )
}

function Scene({ caption, bright, children }: { caption: string; bright?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <figure>
      <div className={`scene${bright ? ' bright' : ''}`}>{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

function Section(props: { tag: string; name: string; why: string; notes: string[]; cols?: number; tall?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className={`version${props.tall ? ' tall' : ''}`}>
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

function Canvas(): React.JSX.Element {
  return (
    <>
      <header>
        <h1 className="serif"><span className="brushed">Corner tile</span>, refined</h1>
        <p>
          C1 taken further: where exactly the tile sits, what it does when you reach for it and while you
          talk, how it shares the corner with the word card, its face as the status, a checkpoint, and the
          awkward cases. Duet is the real mascot: it wakes, stays neutral, and only watches the pointer when
          it comes near — bring the pointer close to any tile.
        </p>
      </header>
      <main>
        <Section tag="1 · Seat" name="Where the tile sits"
          why="Three seats for the same 36px tile. Each keeps the line clear; they differ in how much the tile belongs to the strip."
          notes={['Corner — half over the top edge, 14px in (round two)', 'Shelf — sat on the edge, a smaller tile, more of a mascot on a ledge', 'Badge — over the corner itself, half outside the strip, like an app badge']}>
          <Scene caption="Corner · recommended"><Strip seat="corner" wake /></Scene>
          <Scene caption="Shelf"><Strip seat="shelf" /></Scene>
          <Scene caption="Badge"><Strip seat="badge" /></Scene>
        </Section>

        <Section tall tag="2 · Reach" name="Reaching for Duet"
          why="Pointing at the strip brings the row above it; pointing at Duet says what pressing it will do and what the status is, in one short pill beside it. Duet stays neutral — no greeting until it’s pressed."
          notes={['The tooltip is the status dot’s words, now that the dot has gone', 'The row starts right of the tile, so the two never touch', 'Eyes follow the pointer only once it is near']}>
          <Scene caption="Strip pointed at"><Strip show="hover" /></Scene>
          <Scene caption="Duet pointed at"><Strip show="duet" /></Scene>
          <Scene caption="Word card open — it starts clear of the tile"><Strip show="word" /></Scene>
        </Section>

        <Section tag="3 · Talk" name="Talking, with one Duet"
          why="Pressed, the tile opens into a pill — Duet, what it is doing, End — and what was heard and said shows above the strip as small subtitles. The big Duet in the bubble isn’t needed: there is only ever one Duet on screen."
          notes={['Listening, then speaking (its mouth follows its voice)', 'End sits in the pill, where the finger already is', 'Eyes stop following the pointer while it talks']}>
          <Scene caption="Pressed · listening"><Strip show="talking" mood="listening" status="Listening" /></Scene>
          <Scene caption="Answering · speaking"><Strip show="speaking" mood="speaking" status="Speaking" /></Scene>
          <Scene caption="Done · back to idle"><Strip /></Scene>
        </Section>

        <Section tag="4 · Status" name="Its face is the status" cols={4}
          why="What the dot said, in Duet’s own moods. The words are in the tooltip."
          notes={['Idle · thinking · confused · asleep', 'Confused bends “neutral until pressed”; idle with the tooltip is the strict option', 'Asleep wakes with the engine’s own wake when a video starts']}>
          <Scene caption="Lines coming through · idle"><Strip /></Scene>
          <Scene caption="A line translating · thinking"><Strip mood="thinking" status="Translating the line" /></Scene>
          <Scene caption="Something is wrong · confused"><Strip mood="confused" status="This line could not be translated" /></Scene>
          <Scene caption="Nothing playing · asleep"><Strip mood="asleep" line="idle" status="Nothing playing" /></Scene>
        </Section>

        <Section tag="5 · Checkpoint" name="A checkpoint offered" cols={2}
          why="The strip’s light flows round it as now, and round the tile with it — the two are one shape. Duet looks curious, the one expression before a press: it is asking."
          notes={['Glow kept from today’s overlay, softened to the ink', 'Curious, not excited — no wiggle, no greeting', 'Pointing at the strip opens it, as today']}>
          <Scene caption="Offered"><Strip show="offer" mood="curious" status="A quick checkpoint: point at the strip" /></Scene>
          <Scene caption="Offered, over a bright scene" bright><Strip show="offer" mood="curious" status="A quick checkpoint: point at the strip" /></Scene>
        </Section>

        <Section tag="6 · Edges" name="Awkward cases"
          why="A long line, a one-word line, and a bright scene, to check the tile holds up."
          notes={['Two lines: the tile stays on the top edge, never mid-line', 'One word: the strip keeps its minimum width, so the tile and the row still fit', 'Bright video: the tile’s dark face and the strip’s shadow keep the edge']}>
          <Scene caption="A long line"><Strip line="long" /></Scene>
          <Scene caption="One word"><Strip line="short" /></Scene>
          <Scene caption="Bright scene" bright><Strip /></Scene>
        </Section>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
