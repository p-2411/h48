// Today's tile: a greeting, what today's session holds and Start, then the streak with this week's
// day dots (kept, frozen, missed, today, ahead) and how to keep it. Before anything is watched it
// says how the session comes about instead.
import type { HomeToday, WeekDay } from '../../../../shared/home'
import { streakNote } from '../streak'
import { useLoaded } from '../useLoaded'
import { Tile } from './Tile'

const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_STATES: Record<WeekDay['state'], string> = {
  kept: 'kept',
  frozen: 'missed, covered by a freeze',
  missed: 'missed',
  today: 'today, not kept yet',
  ahead: 'still to come'
}

function greeting(now = new Date()): string {
  const hour = now.getHours()
  return hour < 5
    ? 'Good evening.'
    : hour < 12
      ? 'Good morning.'
      : hour < 18
        ? 'Good afternoon.'
        : 'Good evening.'
}

function plan(today: HomeToday): string {
  if (today.streak.keptToday) return 'Done for today. You can go again any time.'
  if (today.due === 0) return 'A line to say back from what you watched, and one challenge.'
  return `Your ${today.due} ${today.due === 1 ? 'card' : 'cards'}, a line to say back, and one challenge.`
}

export function TodayTile({ onOpen }: { onOpen: (tile: HTMLElement) => void }): React.JSX.Element {
  const { value: today, error, reload } = useLoaded(loadToday, 'Could not load today.')
  const open = (button: HTMLElement): void => onOpen(button.closest<HTMLElement>('.tile')!)
  return (
    <Tile id="today" title="Today" loaded={!!today} error={error} reload={reload} onOpen={onOpen}>
      {today && (
        <>
          <h2 className="today-hello">
            {greeting()}
            <br />
            <span className="muted">
              {today.streak.keptToday ? 'Today is kept.' : '5 minutes today?'}
            </span>
          </h2>
          {today.hasWatched || today.due > 0 ? (
            <>
              <p className="muted">{plan(today)}</p>
              <div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={(event) => open(event.currentTarget)}
                >
                  {today.streak.keptToday ? 'Go again' : 'Start today’s session'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">
              Watch something with Duet and today’s session builds itself from it.
            </p>
          )}
          <div className="today-streak">
            <span className="label">
              {today.streak.days} {today.streak.days === 1 ? 'day' : 'days'} in a row
            </span>
            <ol className="week" aria-label="This week">
              {today.week.map((day, index) => (
                <li
                  key={day.day}
                  className={`week-day ${day.state}`}
                  aria-label={`${DAY_NAMES[index]}: ${DAY_STATES[day.state]}`}
                >
                  <span aria-hidden="true">{DAY_LETTERS[index]}</span>
                </li>
              ))}
            </ol>
            <p className="faint">{streakNote(today.streak)}</p>
          </div>
        </>
      )}
    </Tile>
  )
}
