// Today: the daily session (about 5 minutes: due cards, a line said back, one challenge), the
// streak and the cards to review now.
import { useState } from 'react'
import type { HomeToday } from '../../../shared/home'
import { DailySession } from './daily/DailySession'
import { LoadState } from './LoadState'
import { useLoaded } from './useLoaded'

const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()

/** What keeps the streak going, said for where it stands. */
function streakNote({ days, keptToday, freezesLeft }: HomeToday['streak']): string {
  const freezes = `${freezesLeft} ${freezesLeft === 1 ? 'freeze' : 'freezes'} left this week, so a missed day is covered.`
  if (keptToday) return `Kept for today. ${freezes}`
  if (days === 0) return 'Watch 10 minutes with Duet to start one.'
  return `Watch 10 minutes with Duet today to keep it. ${freezes}`
}

/** `onReview` opens Review (inside Cards). */
export function Today({ onReview }: { onReview: () => void }): React.JSX.Element {
  const { value: today, error, reload } = useLoaded(loadToday, 'Could not load today.')
  const [inSession, setInSession] = useState(false)
  if (inSession)
    return (
      <main className="home-page">
        <h1>Today’s session</h1>
        <DailySession
          onClose={() => {
            setInSession(false)
            reload()
          }}
        />
      </main>
    )
  return (
    <main className="home-page">
      <h1>Today</h1>
      <LoadState loaded={!!today} error={error} reload={reload} />
      {!today ? null : (
        <div className="home-cards">
          <section className="card-box home-session" aria-label="Today’s session">
            <span className="label">Today’s session</span>
            <p className="muted">
              {today.streak.keptToday ? 'Done for today. You can go again any time.' : 'About 5 minutes: your cards, a line to say back, and one challenge.'}
            </p>
            <button type="button" className="btn primary" onClick={() => setInSession(true)}>
              {today.streak.keptToday ? 'Go again' : 'Start'}
            </button>
          </section>
          <section className="card-box" aria-label="Streak">
            <span className="label">Streak</span>
            <p className="home-number">
              {today.streak.days} {today.streak.days === 1 ? 'day' : 'days'}
            </p>
            <p className="muted">{streakNote(today.streak)}</p>
          </section>
          <section className="card-box" aria-label="Review">
            <span className="label">Review</span>
            <p className="home-number">{today.due}</p>
            <p className="muted">
              {today.due > 0
                ? `${today.due === 1 ? 'Card' : 'Cards'} ready to review.`
                : 'Nothing to review right now.'}
            </p>
            <button
              type="button"
              className="btn primary"
              disabled={today.due === 0}
              onClick={onReview}
            >
              Review
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
