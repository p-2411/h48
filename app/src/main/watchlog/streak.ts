// The streak: how many study days in a row the learner kept. A day is kept by finishing the daily
// session, finishing a checkpoint, or watching 10 minutes with Duet. Each week (Monday to Sunday)
// forgives up to two missed days on its own (freezes), so a missed day costs nothing; a third miss
// in one week ends the streak (misses before the streak began use none). Today never breaks it: until today is kept, it runs to yesterday.
// Days are study days (YYYY-MM-DD, see study-day.ts); date steps are done in UTC so clock changes
// don't skip or repeat a day.
import type { Streak } from '../../shared/home'

export const WATCH_MS_FOR_A_DAY = 10 * 60_000
export const FREEZES_PER_WEEK = 2

export type DayRecord = {
  day: string
  watchedMs: number
  sessionDone: boolean
  checkpoints: number
}
export type { Streak } from '../../shared/home'

/** Whether the learner kept this day. */
export function kept(record: DayRecord): boolean {
  return record.sessionDone || record.checkpoints > 0 || record.watchedMs >= WATCH_MS_FOR_A_DAY
}

function parse(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

/** The day `days` days after `day` (before it, when negative). */
export function addDays(day: string, days: number): string {
  const date = parse(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The Monday that starts `day`'s week. */
export function weekOf(day: string): string {
  const sinceMonday = (parse(day).getUTCDay() + 6) % 7
  return addDays(day, -sinceMonday)
}

/** The streak as of `today`, from the days on record (days with no record were missed). */
export function streak(records: DayRecord[], today: string): Streak {
  const keptDays = new Set(records.filter(kept).map((record) => record.day))
  const keptToday = keptDays.has(today)
  const freezesUsed = new Map<string, number>()
  // Misses since the last kept day seen: they use freezes only if an earlier kept day follows, since
  // only then do they bridge anything (misses before the streak began cost nothing).
  let bridging = new Map<string, number>()
  const first = [...keptDays].sort()[0]
  let days = 0
  for (
    let day = keptToday ? today : addDays(today, -1);
    first && day >= first;
    day = addDays(day, -1)
  ) {
    if (keptDays.has(day)) {
      days++
      for (const [week, misses] of bridging)
        freezesUsed.set(week, (freezesUsed.get(week) ?? 0) + misses)
      bridging = new Map()
      continue
    }
    const week = weekOf(day)
    if ((freezesUsed.get(week) ?? 0) + (bridging.get(week) ?? 0) >= FREEZES_PER_WEEK) break
    bridging.set(week, (bridging.get(week) ?? 0) + 1)
  }
  return { days, keptToday, freezesLeft: FREEZES_PER_WEEK - (freezesUsed.get(weekOf(today)) ?? 0) }
}
