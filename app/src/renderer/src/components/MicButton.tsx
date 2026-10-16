// The one mic for saying something back (Today's say-a-line, the gap and use-it cards): a round ink
// button, coral with a stop square while it listens, its ring swelling with the learner's voice, and
// breathing while Duet checks. A short label sits under it.
import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import './mic.css'

export function MicButton({
  recording,
  checking = false,
  level,
  label,
  ariaLabel,
  disabled,
  onClick
}: {
  recording: boolean
  checking?: boolean
  level: () => number
  label?: string
  ariaLabel: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!recording) return
    const node = button.current
    let frame = 0
    let shown = 0
    const tick = (): void => {
      shown += (level() - shown) * 0.35
      node?.style.setProperty('--level', shown.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node?.style.setProperty('--level', '0')
    }
  }, [recording, level])

  return (
    <div className="mic-wrap">
      <button
        ref={button}
        type="button"
        className={`mic${recording ? ' is-recording' : ''}${checking ? ' is-checking' : ''}`}
        aria-label={ariaLabel}
        aria-pressed={recording}
        disabled={disabled || checking}
        onClick={onClick}
      >
        <span className="mic-level" aria-hidden="true" />
        {recording ? (
          <span className="mic-stop" aria-hidden="true" />
        ) : (
          <Icon name="mic" size={24} />
        )}
      </button>
      {label && (
        <span className="mic-label" aria-hidden="true">
          {label}
        </span>
      )}
    </div>
  )
}
