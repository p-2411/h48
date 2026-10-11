// Duet, the mascot (styles in mascot.css). It first plays the opening, the Duet mark separating and
// turning to glass, then shows the state it is given. For people who ask for reduced motion it skips
// the opening and keeps still.
import { useEffect, useState } from 'react'
import './mascot.css'
import { reducedMotion } from './motion'

export type MascotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'success' | 'correction'

// How long the opening runs (its animation is 2.35 s), before the given state shows.
const OPENING_MS = 2_450

const LABEL: Record<MascotState | 'opening', string> = {
  opening: 'waking up',
  idle: 'waiting',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  success: 'pleased',
  correction: 'gently correcting'
}

/** The mascot at `scale` times its full size (420 x 190); `opening: false` skips the opening (a
 * message's avatar). */
export function Mascot({
  state,
  scale = 1,
  opening: opens = true
}: {
  state: MascotState
  scale?: number
  opening?: boolean
}): React.JSX.Element {
  const [opening, setOpening] = useState(() => opens && !reducedMotion())
  useEffect(() => {
    if (!opening) return
    const timer = window.setTimeout(() => setOpening(false), OPENING_MS)
    return () => window.clearTimeout(timer)
  }, [opening])
  const shown = opening ? 'opening' : state
  return (
    <div
      className="duet-mascot"
      data-state={shown}
      style={{ '--scale': scale } as React.CSSProperties}
      role="img"
      aria-label={`Duet, ${LABEL[shown]}`}
    >
      <div className="mascot-canvas" aria-hidden="true">
        <div className="particle-field">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="particle" />
          ))}
        </div>
        <div className="sound-ring" />
        <div className="duet-face">
          <span className="brow brow-left" />
          <span className="brow brow-right" />
          <div className="socket">
            <span className="eye eye-left" />
          </div>
          <div className="socket">
            <span className="eye eye-right" />
          </div>
          <span className="mouth">
            <span className="mouth-core" />
          </span>
        </div>
      </div>
    </div>
  )
}
