// What the streak card says about keeping the streak, for where it stands. Pure, for tests.
import type { Streak } from '../../../shared/home'

/** What keeps the streak going: a missed day is covered only while freezes are left this week. */
export function streakNote({ days, keptToday, freezesLeft }: Streak): string {
  const freezes =
    freezesLeft > 0
      ? `${freezesLeft} ${freezesLeft === 1 ? 'freeze' : 'freezes'} left this week, so a missed day is covered.`
      : 'No freezes left this week, so a missed day ends the streak.'
  if (keptToday) return `Kept for today. ${freezes}`
  if (days === 0) return 'Watch 10 minutes with Duet to start one.'
  return `Watch 10 minutes with Duet today to keep it. ${freezes}`
}
