// The overlay panel: the bar, and the line being spoken.
import { Bar } from './Bar'
import { Line } from './Line'
import { useOverlay } from './useOverlay'

export function Overlay(): React.JSX.Element {
  const { settings, status, current, building } = useOverlay()
  return (
    <div className="panel">
      <Bar settings={settings} status={status} hasLine={!!current} />
      <Line line={current} settings={settings} building={building} modelError={status.modelError} />
    </div>
  )
}
