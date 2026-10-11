// The daily reminder: one notification a day, at the time the learner chose in Settings, and only
// when today isn't kept yet. Off unless a time is set.
import type { Streak } from '../watchlog/streak'

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** A reminder time ("19:30", local), or undefined for anything that isn't one. */
export function parseReminder(value: unknown): string | undefined {
  return typeof value === 'string' && TIME.test(value) ? value : undefined
}

/** When the reminder at `time` next comes after `now` (at the time itself: tomorrow). */
export function nextReminderAt(time: string, now: number): number {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date(now)
  next.setHours(hours, minutes, 0, 0)
  if (next.getTime() <= now) next.setDate(next.getDate() + 1)
  return next.getTime()
}

export class Reminder {
  private timer?: NodeJS.Timeout

  constructor(private readonly deps: { streak: () => Streak; notify: (text: string) => void }) {}

  /** Reminds at `time` every day from now on, or (with none) stops. */
  set(time: string | undefined, now = Date.now()): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!time) return
    this.timer = setTimeout(() => {
      this.remind()
      this.set(time)
    }, nextReminderAt(time, now) - now)
  }

  /** The reminder, unless today is already kept. */
  remind(): void {
    if (!this.deps.streak().keptToday) this.deps.notify('Your 5-minute session is ready: your cards, a line to say back and one challenge.')
  }
}
