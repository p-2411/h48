// The study day: a day of learning runs from 04:00 to 04:00 local time, so a late night counts
// toward the day it started. The review scheduler's daily counts and the streak both go by it.
const ROLLOVER_HOUR = 4

function studyDayStart(now: number): Date {
  const start = new Date(now)
  if (start.getHours() < ROLLOVER_HOUR) start.setDate(start.getDate() - 1)
  start.setHours(ROLLOVER_HOUR, 0, 0, 0)
  return start
}

/** The study day `now` falls in, as YYYY-MM-DD. */
export function studyDay(now: number): string {
  const start = studyDayStart(now)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

/** When the study day `now` falls in ends, in ms since 1970. */
export function studyDayEnd(now: number): number {
  const end = studyDayStart(now)
  end.setDate(end.getDate() + 1)
  return end.getTime()
}
