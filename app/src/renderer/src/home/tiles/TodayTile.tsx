import type { HomeToday } from '../../../../shared/home'
import { useLoaded } from '../useLoaded'
import { Tile } from './Tile'
import { TodayWord } from './TodayWord'
const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export function TodayTile({ onOpen }: { onOpen: (tile: HTMLElement) => void }): React.JSX.Element {
  const { value: today, error, reload } = useLoaded(loadToday, 'Could not load today.')
  const hour = new Date().getHours(),
    greeting =
      hour < 5
        ? 'Good evening.'
        : hour < 12
          ? 'Good morning.'
          : hour < 18
            ? 'Good afternoon.'
            : 'Good evening.'
  return (
    <Tile
      id="today"
      title="Today"
      // This week as its day circles, at the title's far end; the days in a row are in the bar's flame.
      aside={
        today && (
          <ol
            className="week hub-week"
            aria-label={`This week: ${today.streak.days} ${today.streak.days === 1 ? 'day' : 'days'} in a row`}
          >
            {today.week.map((day, i) => (
              <li key={day.day} className={`week-day ${day.state}`} aria-label={`${DAYS[i]}: ${day.state}`}>
                <span aria-hidden="true">{DAYS[i][0]}</span>
              </li>
            ))}
          </ol>
        )
      }
      loaded={!!today}
      error={error}
      reload={reload}
      onOpen={onOpen}
    >
      {today && (
        <>
          <h2 className="today-hello">{greeting}</h2>
          <p className="muted">
            {today.hasWatched || today.due
              ? 'Five minutes with the words you’ve been hearing.'
              : 'Watch something with Duet and today’s session builds itself from it.'}
          </p>

          {today.word && <TodayWord word={today.word} />}
          {(today.hasWatched || today.due > 0) && (
            <div className="today-start">
              <button
                className="btn primary"
                onClick={(e) => onOpen(e.currentTarget.closest<HTMLElement>('.tile')!)}
              >
                {today.streak.keptToday ? 'Go again' : 'Start'} →
              </button>
            </div>
          )}
        </>
      )}
    </Tile>
  )
}
