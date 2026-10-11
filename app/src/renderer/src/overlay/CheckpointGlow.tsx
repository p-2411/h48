import './checkpoint-glow.css'

/** Decorative layers from duet-caption-window-glow.html; the strip's glow class activates them. */
export function CheckpointGlow(): React.JSX.Element {
  return (
    <div className="checkpoint-signal" aria-hidden="true">
      <div className="checkpoint-halo">
        <div className="checkpoint-ribbon">
          <div className="checkpoint-colour" />
        </div>
      </div>
      <div className="checkpoint-spill left" />
      <div className="checkpoint-spill right" />
      <div className="checkpoint-glass">
        <div className="checkpoint-pool left" />
        <div className="checkpoint-pool right" />
      </div>
      <div className="checkpoint-rim" />
    </div>
  )
}
