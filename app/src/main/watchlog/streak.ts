// The streak: how many study days in a row the learner kept. A day is kept by finishing the daily
// session, finishing a checkpoint, or watching 10 minutes with Duet. Each week (Monday to Sunday)
// forgives up to two missed days on its own (freezes), so a missed day costs nothing; a third miss
// in one week ends the streak (misses before the streak began use none). Today never breaks it: until today is kept, it runs to yesterday.
// Days are study days (YYYY-MM-DD, see study-day.ts); date steps are done in UTC so clock changes
// don't skip or repeat a day.
import type { Streak, WeekDay } from '../../shared/home'

export const WATCH_MS_FOR_A_DAY = 10 * 60_000
export const FREEZES_PER_WEEK = 2

export type DayRecord = {
  day: string
  watchedMs: number
  sessionDone: boolean
  checkpoints: number
}
export type { Streak, WeekDay } from '../../shared/home'

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
  const { days, keptToday, freezesLeft } = walk(records, today)
  return { days, keptToday, freezesLeft }
}

/** Today's week, Monday to Sunday, for the day dots: each day kept, frozen (a miss a freeze
 * covered), missed, today (not kept yet) or ahead. */
export function week(records: DayRecord[], today: string): WeekDay[] {
  const { keptDays, frozen } = walk(records, today)
  const monday = weekOf(today)
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index)
    const state: WeekDay['state'] = keptDays.has(day)
      ? 'kept'
      : day > today
        ? 'ahead'
        : day === today
          ? 'today'
          : frozen.has(day)
            ? 'frozen'
            : 'missed'
    return { day, state }
  })
}

/** Walks back from today through the streak: the days it counts, and the misses its freezes covered. */
function walk(
  records: DayRecord[],
  today: string
): Streak & { keptDays: Set<string>; frozen: Set<string> } {
  const keptDays = new Set(records.filter(kept).map((record) => record.day))
  const keptToday = keptDays.has(today)
  const freezesUsed = new Map<string, number>()
  const frozen = new Set<string>()
  // Misses since the last kept day seen: they use freezes only if an earlier kept day follows, since
  // only then do they bridge anything (misses before the streak began cost nothing).
  let bridging: string[] = []
  const first = [...keptDays].sort()[0]
  let days = 0
  for (
    let day = keptToday ? today : addDays(today, -1);
    first && day >= first;
    day = addDays(day, -1)
  ) {
    if (keptDays.has(day)) {
      days++
      for (const missed of bridging) {
        frozen.add(missed)
        freezesUsed.set(weekOf(missed), (freezesUsed.get(weekOf(missed)) ?? 0) + 1)
      }
      bridging = []
      continue
    }
    const week = weekOf(day)
    const bridged = bridging.filter((missed) => weekOf(missed) === week).length
    if ((freezesUsed.get(week) ?? 0) + bridged >= FREEZES_PER_WEEK) break
    bridging.push(day)
  }
  return {
    days,
    keptToday,
    freezesLeft: FREEZES_PER_WEEK - (freezesUsed.get(weekOf(today)) ?? 0),
    keptDays,
    frozen
  }
}
