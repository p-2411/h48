// Checkpoint glows for the refreshed strip: many ways to say "something's here, when you want it",
// each rated for how much it's noticed and how much it pulls from the line. The strip is the refresh's
// updated look (../caption-refresh); the mascot is the real one, asleep. Nothing here is the app's code.
import '../caption-refresh/refresh.css'
import './glow.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'

type Glow = {
  id: string
  name: string
  family: string
  how: string
  noticed: number
  pull: number
  /** Extra parts the glow draws (light layers, a ring, a line). */
  parts?: number
}

const GLOWS: Glow[] = [
  { id: 'none', name: 'No checkpoint', family: 'Reference', how: 'The strip as it is the rest of the time, to compare against.', noticed: 0, pull: 0 },
  { id: 'flow', name: 'Ladder flow', family: 'Around the strip', how: 'Round two’s light: the word-ladder colours turn slowly round the edge, three soft layers.', noticed: 4, pull: 3, parts: 3 },
  { id: 'breath', name: 'Warm breath', family: 'Around the strip', how: 'One colour — the yellow of a word you’ve seen — in a thin halo that breathes in and out every few seconds. Nothing moves round.', noticed: 3, pull: 2 },
  { id: 'comet', name: 'Passing light', family: 'Around the strip', how: 'A short spark of light travels once round the edge every eight seconds; between passes, only a faint warm rim.', noticed: 3, pull: 2, parts: 1 },
  { id: 'tint', name: 'Warm rim', family: 'Around the strip', how: 'No light outside the glass at all: the strip’s own hairline edge slowly warms to yellow and back.', noticed: 2, pull: 1 },
  { id: 'ember', name: 'Ember line', family: 'One edge', how: 'A thin line of ladder light along the strip’s bottom edge, fading at its ends, breathing gently. Reads like a quiet progress bar.', noticed: 3, pull: 1, parts: 1 },
  { id: 'inner', name: 'Light from below', family: 'Inside the glass', how: 'Warm light rises inside the glass from its bottom edge, as if lit from underneath. Never spills onto the video.', noticed: 2, pull: 1 },
  { id: 'corner', name: 'Corner bloom', family: 'One corner', how: 'A soft warm bloom at the strip’s right end, where Explain and the actions live, breathing slowly.', noticed: 3, pull: 2 },
  { id: 'sheen', name: 'Sheen', family: 'Inside the glass', how: 'Every eight seconds a faint sheen sweeps once across the glass, left to right, like light catching it.', noticed: 2, pull: 2 },
  { id: 'dots', name: 'Ladder dots', family: 'The status', how: 'The status dot becomes four tiny dots in the ladder’s colours, lighting one after another. Only the corner changes.', noticed: 2, pull: 1, parts: 4 },
  { id: 'word', name: 'The word glows', family: 'On the line', how: 'The word the checkpoint is about warms a little brighter, softly, in its own colour — you see what it’s about.', noticed: 3, pull: 2 },
  { id: 'duet', name: 'Duet stirs', family: 'Duet', how: 'The strip stays still. Duet’s button gets a soft warm halo that breathes, and stops resting dim — Duet has something.', noticed: 2, pull: 1 }
]

function SleepyDuet(): React.JSX.Element {
  return (
    <button className="talk-button" title="Talk to Duet">
      <span className="tile-face">
        <DuetMascot state="asleep" width={28} finish="flat" theme="dark" watch="near" label="Duet, asleep" />
      </span>
    </button>
  )
}

function Meter({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <span className="meter" title={`${label}: ${value} of 5`}>
      <span className="meter-label">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= value ? 'on' : ''} />)}
    </span>
  )
}

function Strip({ glow }: { glow: Glow }): React.JSX.Element {
  return (
    <div className="stage new">
      <div className="dock">
        <div className={`strip-row g-${glow.id}`}>
          <SleepyDuet />
          {glow.parts !== undefined && (
            <span className="glow-parts" aria-hidden="true">
              {Array.from({ length: glow.parts }, (_, i) => <i key={i} />)}
            </span>
          )}
          <div className="strip">
            {glow.id === 'dots' ? (
              <span className="ladder-dots" aria-hidden="true"><i /><i /><i /><i /></span>
            ) : (
              <i className="dot ok" />
            )}
            <div className="line">
              <p className="mix" lang="es">
                <span className="w">I have to</span> <span className="w sw live asked" data-k="encountered">madrugar</span>{' '}
                <span className="w sw live" data-k="known">mañana</span>
                <span className="w">, so</span> <span className="w sw live" data-k="speakable">vámonos</span>
                <span className="w">.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Canvas(): React.JSX.Element {
  const [bright, setBright] = useState(false)
  const [run, setRun] = useState(0)
  return (
    <div className={bright ? 'bright-video' : undefined}>
      <header>
        <h1>Checkpoint <span className="brushed">glows</span></h1>
        <p>
          A checkpoint should be felt more than seen: you notice, at the edge of your attention, that something has
          come up, and you choose when to look. Each glow below is on the refreshed strip, live, rated for how much it
          gets noticed and how much it pulls from the line. Every one arrives with a short fade, then settles.
        </p>
        <div className="controls">
          <button className={!bright ? 'on' : ''} onClick={() => setBright(false)}>Dark scene</button>
          <button className={bright ? 'on' : ''} onClick={() => setBright(true)}>Bright scene</button>
          <button onClick={() => setRun((n) => n + 1)}>Replay the arrival</button>
        </div>
      </header>
      <main className="glow-grid" key={run}>
        {GLOWS.map((glow) => (
          <figure key={glow.id} className="glow-card">
            <div className="scene"><Strip glow={glow} /></div>
            <figcaption>
              <span className="family">{glow.family}</span>
              <h2>{glow.name}</h2>
              <p>{glow.how}</p>
              {glow.id !== 'none' && (
                <span className="meters">
                  <Meter label="Noticed" value={glow.noticed} />
                  <Meter label="Pulls from the line" value={glow.pull} />
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
