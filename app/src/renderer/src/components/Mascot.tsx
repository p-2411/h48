// Duet, the mascot (styles in mascot.css). It first plays the opening, the Duet mark separating and
// turning to glass, then shows the state it is given. For people who ask for reduced motion it skips
// the opening and keeps still.
import { useEffect, useRef, useState, type RefObject } from 'react'
import './mascot.css'
import { reducedMotion } from './motion'
import { useSpeechMouth } from './useSpeechMouth'

export type MascotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'success' | 'correction'

const LABEL: Record<MascotState | 'opening', string> = {
  opening: 'waking up',
  idle: 'waiting',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  success: 'pleased',
  correction: 'gently correcting'
}

/** The mascot at `scale` times its full size (420 x 190); `opening: false` skips the opening (where
 * it should just be there, as on the hub's Talk tile). */
export function Mascot({
  state,
  scale = 1,
  opening: opens = true,
  openingDuration = 2350,
  speechAudio
}: {
  state: MascotState
  scale?: number
  opening?: boolean
  /** Duration of the mark-to-glass morph, in milliseconds. */
  openingDuration?: number
  /** Duet's voice as it plays: while speaking, the mouth follows its loudness (useSpeechMouth). */
  speechAudio?: RefObject<HTMLAudioElement | null>
}): React.JSX.Element {
  const [opening, setOpening] = useState(() => opens && !reducedMotion())
  useEffect(() => {
    if (!opening) return
    const timer = window.setTimeout(() => setOpening(false), openingDuration + 100)
    return () => window.clearTimeout(timer)
  }, [opening, openingDuration])
  const shown = opening ? 'opening' : state
  const mascot = useRef<HTMLDivElement>(null)
  useSpeechMouth(mascot, shown === 'speaking', speechAudio)
  return (
    <div
      ref={mascot}
      className="duet-mascot"
      data-state={shown}
      style={{ '--scale': scale, '--opening-duration': `${openingDuration}ms` } as React.CSSProperties}
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
