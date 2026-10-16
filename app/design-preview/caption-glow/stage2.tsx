// Checkpoint glows, stage two: the five kept from stage one, now in Duet's ink white instead of colour,
// each shown over a dark and a bright video. White light alone vanishes on a bright shot, so each glow
// carries a faint ink shadow under its light; on dark video the shadow disappears into the scene.
import '../caption-refresh/refresh.css'
import './glow.css'
import './stage2.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'

type Glow = { id: string; name: string; how: string; parts?: number }

const GLOWS: Glow[] = [
  { id: 'ember', name: 'Ember line', how: 'A thin line of white light just inside the strip’s bottom edge, fading at its ends, breathing.', parts: 1 },
  { id: 'inner', name: 'Light from below', how: 'White light rising inside the glass from its bottom edge. Nothing spills onto the video.' },
  { id: 'inner-strong', name: 'Light from below · brighter', how: 'The same white light, stronger, with a brighter bottom edge. Inside the glass, so the dark glass carries it on any video.' },
  { id: 'grad-seaglass', name: 'Brighter · sea glass', how: 'The home’s sea-glass colours along the bottom: honey, foam, aqua, lilac. Frosted, never full strength, so the word colours stay the brightest thing.' },
  { id: 'grad-soft', name: 'Sea glass · soft (kept)', how: 'The sea glass, eased: a little less light, the colours fading in from clear at both ends, and a slower, longer breath. There, and pleasant to have there.' },
  { id: 'grad-dusk', name: 'Brighter · dusk', how: 'Honey into lilac: a warm-to-cool sea-glass pair, like light at the end of the day. Calm, still clearly there.' },
  { id: 'grad-shore', name: 'Brighter · shore', how: 'Foam into aqua with clear at the ends: the cool sea-glass pair, the quietest of the three.' },
  { id: 'inner-rung', name: 'Light from below · the word’s colour', how: 'The light in the colour of the word the checkpoint is about (madrugar, seen: yellow). Colour that means something: it says which word.' },
  { id: 'inner-ladder', name: 'Light from below · ladder', how: 'The word ladder spread along the bottom edge, yellow to green, rising softly: a word about to climb.' },
  { id: 'corner', name: 'Corner bloom', how: 'A soft white bloom at the strip’s right end, where Explain lives, breathing.' },
  { id: 'duet', name: 'Duet stirs', how: 'The strip stays still; Duet’s button gets a white halo that breathes, and stops resting dim.' },
  { id: 'flow', name: 'Light flow', how: 'A highlight travels slowly round the edge, white fading to nothing, with a soft halo behind.', parts: 2 }
]

function Strip({ glow }: { glow: Glow }): React.JSX.Element {
  return (
    <div className="stage new">
      <div className="dock">
        <div className={`strip-row w-${glow.id}`}>
          <button className="talk-button" title="Talk to Duet">
            <span className="tile-face">
              <DuetMascot state="asleep" width={28} finish="flat" theme="dark" watch="near" label="Duet, asleep" />
            </span>
          </button>
          {glow.parts !== undefined && (
            <span className="glow-parts" aria-hidden="true">
              {Array.from({ length: glow.parts }, (_, i) => <i key={i} />)}
            </span>
          )}
          <div className="strip">
            <i className="dot ok" />
            <div className="line">
              <p className="mix" lang="es">
                <span className="w">I have to</span> <span className="w sw live" data-k="encountered">madrugar</span>{' '}
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
  const [run, setRun] = useState(0)
  return (
    <>
      <header>
        <h1>Glows in <span className="brushed">white</span></h1>
        <p>
          The five kept from stage one, in Duet’s ink white: light, not colour, so the word colours stay the only colour
          on screen. Each is shown over a dark and a bright video. On bright video, white alone would vanish, so every
          glow carries a faint ink shadow under its light.
        </p>
        <div className="controls"><button onClick={() => setRun((n) => n + 1)}>Replay the arrival</button></div>
      </header>
      <main className="stage2" key={run}>
        <div className="s2-head"><span /><span>Dark video</span><span>Bright video</span></div>
        {GLOWS.map((glow) => (
          <section key={glow.id} className="s2-row">
            <div>
              <h2>{glow.name}</h2>
              <p>{glow.how}</p>
            </div>
            <div className="scene"><Strip glow={glow} /></div>
            <div className="scene bright"><Strip glow={glow} /></div>
          </section>
        ))}
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
