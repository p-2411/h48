// Today's caption strip beside the same strip in the current design scheme: the layout, the parts and
// where they sit don't change; only the colours, the grain, the type and Duet do. Mock markup of the
// overlay's own (overlay.css, LineView, Overlay), nothing here is the app's code.
import './refresh.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DuetMascot } from '../../src/renderer/src/components/duet/DuetMascot'
import { Icon } from '../../src/renderer/src/components/Icon'

type Look = 'orig' | 'new'
type Show = 'rest' | 'hover' | 'word' | 'settings' | 'talking' | 'offer'

// Updated: Duet dozes in its tile. Asleep, the engine itself peeks (one eye, then both, drowsy) when
// the pointer comes near and stays a moment; pressing it wakes it with the engine's own wake (crouch,
// stretch, eyes open) into idle. Pressing again lets it doze off.
function SleepyDuet(): React.JSX.Element {
  const [awake, setAwake] = useState(0)
  return (
    <button className={`talk-button${awake ? ' on' : ''}`} title={awake ? 'Duet is listening — press to let it rest' : 'Talk to Duet'} onClick={() => setAwake((n) => (n > 0 ? 0 : n + 1))}>
      <span className="tile-face">
        {awake ? (
          // Mounted asleep and woken: the engine's own smooth wake, then idle.
          <DuetMascot key={`awake-${awake}`} state="idle" wake width={28} finish="flat" theme="dark" watch="near" label="Duet" />
        ) : (
          <DuetMascot key="asleep" state="asleep" width={28} finish="flat" theme="dark" watch="near" label="Duet, asleep" />
        )}
      </span>
    </button>
  )
}

function TalkButton({ look }: { look: Look }): React.JSX.Element {
  if (look === 'new') return <SleepyDuet />
  return (
    <button className="talk-button" title="Talk to Duet">
      <Icon name="duet" />
    </button>
  )
}

function Settings({ look }: { look: Look }): React.JSX.Element {
  const [on, setOn] = useState<Record<string, boolean>>({ full: true, guess: true, wait: false, pause: true, check: true })
  const rows: [string, string, string][] = [
    ['full', 'Show the whole Spanish line', 'Under the mixed line, when you hover the strip'],
    ['guess', 'Hide English until I look', 'Hover the English to see it'],
    ['wait', 'Pause for slow translations', 'Only on videos with a transcript'],
    ['pause', 'Pause while explaining', 'While the Explain panel is open'],
    ['check', 'Checkpoints', 'A glow on the strip at a pause or a break: one quick challenge']
  ]
  return (
    <div className="settings">
      <span className="label">While watching</span>
      {rows.map(([k, label, hint]) => (
        <button key={k} className={`toggle${on[k] ? ' is-on' : ''}`} onClick={() => setOn({ ...on, [k]: !on[k] })}>
          <span>{label}<small>{hint}</small></span>
          <span className="switch" aria-hidden="true"><i /></span>
        </button>
      ))}
      <div className="quiet-row">
        <button className="quiet">More settings</button>
        <button className="quiet">Open the whole script</button>
      </div>
    </div>
  )
}

function Strip({ look, show }: { look: Look; show: Show }): React.JSX.Element {
  const pinned = show === 'hover' || show === 'word' || show === 'settings'
  return (
    <div className={`stage ${look}`}>
      <div className={`dock${pinned ? ' pinned' : ''}${show === 'offer' ? ' asking' : ''}`}>
        {show === 'talking' && (
          <div className="talk-bubble">
            <DuetMascot state="speaking" width={120} finish="glass" theme="dark" watch="off" speaking label="Duet" />
            <div className="talk-lines">
              <p className="talk-heard">How do I say “I overslept”?</p>
              <p className="talk-said" lang="es">Me quedé dormido.</p>
            </div>
            <div className="talk-actions"><span className="talk-link">Text chat</span><span className="talk-link">End</span></div>
          </div>
        )}
        <div className="actions">
          <span className="level-blob">2</span>
          <span className="spacer" />
          <button className="act primary">Explain</button>
          <button className="act icon" title="Save this line"><Icon name="star" /></button>
          <button className="act icon" title="Replay this line"><Icon name="replay" /></button>
          <button className="act icon" title="Settings"><Icon name="settings" /></button>
        </div>
        {show === 'settings' && <Settings look={look} />}
        {show === 'word' && (
          <div className="popup">
            <span className="card-labels"><span className="job">Verb</span><span className="rung" data-k="encountered">Heard</span></span>
            <b lang="es" data-k="encountered">madrugar</b>
            <span>to get up early</span>
            <span className="row">
              <button className="pill on"><Icon name="star" size={13} filled />Saved</button>
              <button className="pill">Explain line</button>
              <button className="pill">Ignore</button>
            </span>
          </div>
        )}
        <div className="strip-row">
          <TalkButton look={look} />
          {show === 'offer' && (
            <span className="strip-glow" aria-hidden="true"><i /><i /><i /><i /></span>
          )}
          <div className={`strip${show === 'offer' ? ' glow' : ''}`}>
            <i className={`dot ${show === 'talking' ? 'busy' : 'ok'}`} />
            <div className="line">
              <p className="mix" lang="es">
                <span className="w">I have to</span> <span className="w sw live" data-k="encountered">madrugar</span>{' '}
                <span className="w sw live" data-k="known">mañana</span>
                <span className="w">, so</span> <span className="w sw live" data-k="speakable">vámonos</span>
                <span className="w">.</span>
              </p>
              {pinned && (
                <div className="more">
                  <p className="source" lang="es">Mañana tengo que madrugar, así que vámonos.</p>
                  <p className="english guess">I have to get up early tomorrow, so let's go.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ROWS: { show: Show; name: string; note: string }[] = [
  { show: 'rest', name: 'At rest', note: 'The same flat, translucent glass, in the home’s green-tinted ink instead of Apple grey; the text turns from pure white to ink white. Duet dozes in its tile: bring the pointer near and it peeks, press it and it wakes.' },
  { show: 'hover', name: 'Pointed at', note: 'Same row, same order. The white Explain and the level circle take the ink white; the full line and the English stay where they are.' },
  { show: 'word', name: 'A word’s card', note: 'Same card, same place. Paper instead of stark white, ink text, and the word in Source Serif 4 — Duet’s voice, at a size the serif reads well.' },
  { show: 'settings', name: 'Settings (⚙)', note: 'Same popover, same switches. The ink glass, ink-white text, and the home’s switches: off is a dim track, on is ink white with a dark knob.' },
  { show: 'talking', name: 'Talking to Duet', note: 'Same layout, already the new mascot. Duet’s reply is set in Source Serif 4 — its voice — and the button that starts it becomes Duet’s own face tile, as in the home bar.' },
  { show: 'offer', name: 'A checkpoint offered', note: 'Siri’s flowing light gives way to light from below, inside the glass, in the home’s sea-glass colours, breathing slowly: noticed, never pulling from the line, on dark or bright video.' }
]

function Canvas(): React.JSX.Element {
  return (
    <>
      <header>
        <h1>Caption window, <span className="brushed">refreshed</span></h1>
        <p>
          Today’s strip, unchanged in layout, beside the same strip in the current design scheme. Nothing moves and
          nothing new is added: the glass, the text, the buttons and the word card take the home’s ink, grain and
          type, and the talk button becomes Duet’s face.
        </p>
        <ul className="changes">
          <li><b>Glass</b> rgba(30,30,32) Apple grey → ink rgba(20,23,22), same translucency, still flat</li>
          <li><b>Text</b> #fff and greys → ink white #eef3f1, #c9d0ce, #9aa3a0</li>
          <li><b>Buttons</b> white primary → ink white on ink</li>
          <li><b>Word card</b> white, 17px bold → paper #f7f8f7, Source Serif 4 26px</li>
          <li><b>Talk button</b> icon → Duet’s real face, asleep, in the same quiet round button</li>
          <li><b>Kept</b> every position, size and motion; word colours; status dot</li>
        </ul>
      </header>
      <main>
        <div className="cols-head"><span>Original</span><span>Updated</span></div>
        {ROWS.map((row) => (
          <section key={row.show} className={`row-pair row-${row.show}`}>
            <div className="row-label">
              <h2>{row.name}</h2>
              <p>{row.note}</p>
            </div>
            <div className="pair">
              <div className="scene"><Strip look="orig" show={row.show} /></div>
              <div className="scene"><Strip look="new" show={row.show} /></div>
            </div>
          </section>
        ))}
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Canvas />)
