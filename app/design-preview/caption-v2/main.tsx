// Round two of the caption window: Ink + Brush as the strip, and three ways for Duet to sit on it,
// with the real mascot (DuetMascot, the SVG engine) rather than a drawing of it. Mock markup only;
// nothing here is the app's overlay code.
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'
import type { DuetMood } from '../../src/renderer/src/components/duet/engine'

type Show = 'rest' | 'hover' | 'word'
type Perch = 'none' | 'tile' | 'peek' | 'inline' | 'inside' | 'beside'

const SHOW_LABEL: Record<Show, string> = { rest: 'At rest', hover: 'Pointed at', word: 'Word card open' }

function Face({ mood, size, wake }: { mood: DuetMood; size: number; wake?: boolean }): React.JSX.Element {
  return <DuetMascot state={mood} width={size} finish="flat" theme="dark" watch="near" wake={wake} label="Duet" />
}

function Duet({ perch, mood, wake }: { perch: Perch; mood: DuetMood; wake?: boolean }): React.JSX.Element | null {
  if (perch === 'none') return null
  if (perch === 'tile')
    return (
      <button className="perch tile" title="Talk to Duet">
        <span className="tile-face"><Face mood={mood} size={30} wake={wake} /></span>
      </button>
    )
  if (perch === 'peek')
    return (
      <button className="perch peek" title="Talk to Duet">
        <span className="peek-clip"><Face mood={mood} size={46} wake={wake} /></span>
      </button>
    )
  if (perch === 'inside')
    return (
      <button className="perch inside" title="Talk to Duet">
        <span className="tile-face"><Face mood={mood} size={30} wake={wake} /></span>
      </button>
    )
  if (perch === 'beside')
    return (
      <button className="perch beside" title="Talk to Duet">
        <span className="tile-face"><Face mood={mood} size={34} wake={wake} /></span>
      </button>
    )
  return (
    <button className="perch inline" title="Talk to Duet">
      <Face mood={mood} size={34} wake={wake} />
    </button>
  )
}

function Strip({ show, perch, mood = 'idle', wake, line = true }: { show: Show; perch: Perch; mood?: DuetMood; wake?: boolean; line?: boolean }): React.JSX.Element {
  return (
    <div className={`dock perch-${perch}${show !== 'rest' ? ' pinned' : ''}${show === 'word' ? ' card-open' : ''}`}>
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
        <Duet perch={perch} mood={mood} wake={wake} />
        <div className="body">
          {line ? (
            <p className="mix" lang="es">
              <span className="w">I have to</span> <span className="w sw" data-k="seen">madrugar</span>{' '}
              <span className="w sw" data-k="known">mañana</span>
              <span className="w">, so</span> <span className="w sw" data-k="say">vámonos</span>
              <span className="w">.</span>
            </p>
          ) : (
            <p className="idle">Lines appear here as they are spoken</p>
          )}
          <div className="more"><div>
            <span className="pad" />
            <p className="source" lang="es">Mañana tengo que madrugar, así que vámonos.</p>
            <p className="english">I have to get up early tomorrow, so let's go.</p>
          </div></div>
        </div>
        {perch === 'none' && <span className="dot" />}
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

function Version(props: { tag: string; name: string; why: string; notes: string[]; two?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="version">
      <div>
        <span className="tag">{props.tag}</span>
        <h2 className="serif">{props.name}</h2>
        <p className="why">{props.why}</p>
        <ul>{props.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
      <div className={`scenes${props.two ? ' two' : ''}`}>{props.children}</div>
    </section>
  )
}

const threeStates = (perch: Perch): React.JSX.Element[] =>
  (['rest', 'hover', 'word'] as Show[]).map((show) => (
    <Scene key={show} caption={SHOW_LABEL[show]}>
      <Strip show={show} perch={perch} wake={show === 'rest'} />
    </Scene>
  ))

const MOODS: { mood: DuetMood; caption: string; line?: boolean }[] = [
  { mood: 'idle', caption: 'Lines coming through · idle' },
  { mood: 'thinking', caption: 'A line translating · thinking' },
  { mood: 'confused', caption: 'Something is wrong · confused' },
  { mood: 'asleep', caption: 'Nothing playing · asleep', line: false }
]

function Canvas(): React.JSX.Element {
  return (
    <>
      <header>
        <h1 className="serif"><span className="brushed">Caption window</span>, round two</h1>
        <p>
          The two picks from round one, taken further. First Ink + Brush as the strip itself, then three
          ways for Duet to sit on it, then Duet’s face standing in for the status dot. Duet here is the real
          mascot engine: it wakes, stays neutral, and only watches the pointer when it comes near. Hover
          any strip, and bring the pointer close to Duet.
        </p>
      </header>
      <main>
        <Version tag="AB" name="Ink + Brush" why="Round one’s A and B as one strip: the home’s ink and grain, the brush stroke under each learned word in its rung’s colour, and the paper card with a serif, brushed headword."
          notes={['Words stay ink; colour lives in the stroke', 'New words get a faint stroke', 'Status dot kept, for comparison with C']}>
          {threeStates('none')}
        </Version>
        <Version tag="C1" name="Corner tile" why="Duet in the home bar’s face tile, sat half over the strip’s top-left corner. Replaces the round talk button beside the strip and the status dot."
          notes={['Same tile as the home bar: one Duet everywhere', 'Sits above the line, never covers it', 'The hover row starts right of it']}>
          {threeStates('tile')}
        </Version>
        <Version tag="C2" name="Peeking" why="No tile: just Duet’s eyes, peeking over the strip’s top edge as if from behind it. The quietest, and the most alive."
          notes={['Only the top of the face shows', 'Least weight on the strip', 'Smallest target to click — rises a little on hover']}>
          {threeStates('peek')}
        </Version>
        <Version tag="C3" name="Speaker" why="Duet inside the strip, at the line’s start, like the name before a line in a script — Duet is the one bringing you the line."
          notes={['Reads as “Duet says…”', 'Costs ~40px of line width', 'No overlap with cards or the hover row']}>
          {threeStates('inline')}
        </Version>
        <Version tag="C4" name="Inside" why="Duet’s face tile inside the strip, at its left end, level with the line — part of the strip itself, like an avatar beside a message."
          notes={['One shape: nothing hangs off the strip', 'The tile reads as a button, so pressing it is obvious', 'Costs ~46px of line width; stays by the line as the strip opens']}>
          {threeStates('inside')}
        </Version>
        <Version tag="C5" name="Beside" why="Duet on its own to the left of the strip, with a gap — where today’s round talk button is, but the real face tile, a little larger."
          notes={['The line keeps the strip’s full width', 'Duet stands apart: a companion next to the subtitles, not part of them', 'Needs room left of the strip; sits on its bottom edge as the strip grows']}>
          {threeStates('beside')}
        </Version>
        <Version two tag="C1 · status" name="Duet is the status" why="With Duet on the strip, its face says what the dot did. Shown on the corner tile; the same moods work for C2 to C5."
          notes={['From the engine’s own moods', 'Confused shows before any click — a bend of “neutral until clicked”; idle instead is the strict option', 'Status words stay in its tooltip']}>
          {MOODS.map(({ mood, caption, line }) => (
            <Scene key={mood} caption={caption}>
              <Strip show="rest" perch="tile" mood={mood} line={line} />
            </Scene>
          ))}
        </Version>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
