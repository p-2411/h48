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

// The clock is looked at this often. A timer counted down to the time would come late after the Mac
// slept (timers don't count during sleep).
const CHECK_EVERY_MS = 60_000
// A reminder this late (the Mac slept through it) is skipped, not given.
const LATE_MS = 2 * 60 * 60_000

export class Reminder {
  private timer?: NodeJS.Timeout
  private time?: string
  private nextAt?: number

  constructor(private readonly deps: { streak: () => Streak; notify: (text: string) => void }) {}

  /** Reminds at `time` every day from now on, or (with none, or not a time) stops. */
  set(time: string | undefined, now = Date.now()): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.time = parseReminder(time)
    this.nextAt = this.time ? nextReminderAt(this.time, now) : undefined
    if (this.time) this.timer = setInterval(() => this.check(), CHECK_EVERY_MS)
  }

  /** Gives the reminder if its time has come (and isn't long gone), then waits for the next. */
  check(now = Date.now()): void {
    if (!this.time || this.nextAt === undefined || now < this.nextAt) return
    if (now - this.nextAt < LATE_MS) this.remind()
    this.nextAt = nextReminderAt(this.time, now)
  }

  /** The reminder, unless today is already kept. */
  remind(): void {
    if (!this.deps.streak().keptToday) this.deps.notify('Your 5-minute session is ready: your cards, a line to say back and one challenge.')
  }
}
