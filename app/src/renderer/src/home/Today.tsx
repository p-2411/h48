// Today: the streak and the cards to review now. The daily session joins it later (piece 3).
import type { HomeToday } from '../../../shared/home'
import { useLoaded } from './useLoaded'

const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()

/** What keeps the streak going, said for where it stands. */
function streakNote({ days, keptToday, freezesLeft }: HomeToday['streak']): string {
  const freezes = `${freezesLeft} ${freezesLeft === 1 ? 'freeze' : 'freezes'} left this week, so a missed day is covered.`
  if (keptToday) return `Kept for today. ${freezes}`
  if (days === 0) return 'Watch 10 minutes with Duet to start one.'
  return `Watch 10 minutes with Duet today to keep it. ${freezes}`
}

export function Today(): React.JSX.Element {
  const { value: today, error, reload } = useLoaded(loadToday, 'Could not load today.')
  return (
    <main className="home-page">
      <h1>Today</h1>
      {error && (
        <p className="notice error row" role="alert">
          <span>{error}</span>
          <button type="button" className="btn quiet" onClick={reload}>
            Try again
          </button>
        </p>
      )}
      {!today ? (
        !error && (
          <p className="faint" role="status">
            Loading…
          </p>
        )
      ) : (
        <div className="home-cards">
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
              onClick={() => window.duet.cards.openReview()}
            >
              Review
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
