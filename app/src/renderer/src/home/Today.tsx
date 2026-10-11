// Today: the daily session (about 5 minutes: due cards, a line said back, one challenge), opened from
// Today's tile on the hub; its end goes back to the hub.
import { DailySession } from './daily/DailySession'

export function Today({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <main className="home-page today-page">
      <h1>Today’s session</h1>
      <DailySession onClose={onClose} />
    </main>
  )
}
