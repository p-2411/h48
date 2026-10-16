import type { HomeToday } from '../../../../shared/home'
import { streakNote } from '../streak'
import { useLoaded } from '../useLoaded'
import { Tile } from './Tile'
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
    <Tile id="today" title="Today" loaded={!!today} error={error} reload={reload} onOpen={onOpen}>
      {today && (
        <>
          <h2 className="today-hello">{greeting}</h2>
          <p className="muted">
            {today.hasWatched || today.due
              ? 'Five minutes with the words you’ve been hearing.'
              : 'Watch something with Duet and today’s session builds itself from it.'}
          </p>

          {today.word && (
            <div className="today-word">
              <span className="label">Your word for today</span>
              <span className="word-large" data-k={today.word.state}>
                {today.word.word}
              </span>
              <p>{today.word.meaning}</p>
              <p className="faint">
                Heard {today.word.seen} {today.word.seen === 1 ? 'time' : 'times'}
                {today.word.source && ` · ${today.word.source}`}
              </p>
            </div>
          )}
          <ol className="hub-steps">
            <li>
              <b>1</b>Say a line back
            </li>
            <li>
              <b>2</b>Review {today.due} cards
            </li>
            <li>
              <b>3</b>One challenge
            </li>
          </ol>
          <div className="hub-streak">
            <span className="hub-streak-days">
              {today.streak.days} {today.streak.days === 1 ? 'day' : 'days'} in a row
            </span>
            <ol className="week" aria-label="This week">
              {today.week.map((day, i) => (
                <li
                  key={day.day}
                  className={`week-day ${day.state}`}
                  aria-label={`${DAYS[i]}: ${day.state}`}
                >
                  <span aria-hidden="true">{DAYS[i][0]}</span>
                </li>
              ))}
            </ol>
            <p className="faint hub-streak-note">{streakNote(today.streak)}</p>
          </div>
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
