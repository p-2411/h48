import { useId } from 'react'
import type { TutorLiveStatus } from './useLiveTutor'

/** Duet's original overlap mark, softened into one quiet glass eye. Monochrome by design. */
export function DuetMascot({
  status = 'idle',
  small = false
}: {
  status?: TutorLiveStatus
  small?: boolean
}): React.JSX.Element {
  const id = useId().replaceAll(':', '')
  const glass = `duet-glass-${id}`
  const glow = `duet-glow-${id}`

  return (
    <span className={`duet-mascot mascot-${status}${small ? ' is-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 98 88" role="presentation">
        <defs>
          <linearGradient id={glass} x1="13" y1="9" x2="82" y2="80">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.82" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.24" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
          </linearGradient>
          <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4.5" result="mist" />
            <feMerge>
              <feMergeNode in="mist" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="mascot-friend" filter={`url(#${glow})`}>
          <rect
            className="mascot-shell"
            x="8"
            y="10"
            width="58"
            height="46"
            rx="18"
            fill={`url(#${glass})`}
          />
          <rect
            className="mascot-face"
            x="33"
            y="31"
            width="58"
            height="47"
            rx="18"
            fill={`url(#${glass})`}
          />
          <g className="mascot-eye">
            <path d="M45 54.5s5.2-7.2 15.2-7.2 15.2 7.2 15.2 7.2-5.2 7.2-15.2 7.2S45 54.5 45 54.5Z" />
            <circle className="mascot-pupil" cx="60.2" cy="54.5" r="4.7" />
            <circle className="mascot-highlight" cx="62" cy="52.8" r="1.35" />
          </g>
          <g className="mascot-signal">
            <rect x="18" y="27" width="3" height="9" rx="1.5" />
            <rect x="24" y="23" width="3" height="17" rx="1.5" />
            <rect x="30" y="29" width="3" height="6" rx="1.5" />
          </g>
        </g>
      </svg>
    </span>
  )
}
