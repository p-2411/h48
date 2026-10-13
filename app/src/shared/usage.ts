// What Duet's server says the learner has used (GET /v1/duet/me), and the sentence Duet shows when a
// cap is reached. Shared by main (the strip, the tutor) and the home base.

export type Plan = 'free' | 'paid'

export type Usage = {
  plan: Plan
  /** A Free account on a computer that already has two: it gets no free credits. */
  freeBlocked: boolean
  /** In credits (1 credit = $0.01 of AI). */
  credits: { used: number; cap: number; resetsAt: string }
  hours: { usedMs: number; capMs: number; resetsAt: string }
  /** Payments are set up on the server: Upgrade and Manage plan work. */
  billing: boolean
}

/** The server's reply at a cap (402, error code usage_cap). */
export type CapReached = { cap: 'credits' | 'hours'; resets_at: string; blocked?: boolean }

export function isCapReached(value: unknown): value is CapReached {
  const cap = (value as CapReached | undefined)?.cap
  return (
    (cap === 'credits' || cap === 'hours') && typeof (value as CapReached).resets_at === 'string'
  )
}

/** "You've used this month's Duet credits. More come on 1 November." `timeZone` is for tests. */
export function capSentence(reached: CapReached, timeZone?: string): string {
  if (reached.blocked)
    return 'Free Duet is limited to two accounts on one computer. Upgrade to go on.'
  const when = new Date(reached.resets_at)
  if (reached.cap === 'hours') {
    const day = when.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone
    })
    return `You’ve used your watch hours. More come on ${day.replace(',', '')}.`
  }
  const day = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone })
  return `You’ve used this month’s Duet credits. More come on ${day}.`
}

/** What the home base shows of the plan: a line, a bar (0 to 1) and when more comes, per meter. */
export type UsageSummary = {
  plan: string
  hours: { label: string; fraction: number; resets: string }
  credits: { label: string; fraction: number; resets: string }
}

function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

const fraction = (used: number, cap: number): number =>
  cap > 0 ? Math.min(1, Math.max(0, used / cap)) : 1

export function usageSummary(usage: Usage, timeZone?: string): UsageSummary {
  const day = (iso: string, weekday: boolean): string =>
    new Date(iso)
      .toLocaleDateString('en-GB', {
        ...(weekday ? { weekday: 'long' } : {}),
        day: 'numeric',
        month: 'long',
        timeZone
      })
      .replace(',', '')
  const free = usage.plan === 'free'
  return {
    plan: free ? 'Free' : 'Paid',
    hours: {
      label: `${duration(usage.hours.usedMs)} of ${duration(usage.hours.capMs)} this ${free ? 'week' : 'month'}`,
      fraction: fraction(usage.hours.usedMs, usage.hours.capMs),
      resets: `More on ${day(usage.hours.resetsAt, free)}`
    },
    credits: {
      label: `${Math.floor(usage.credits.used)} of ${usage.credits.cap} credits this month`,
      fraction: fraction(usage.credits.used, usage.credits.cap),
      resets: `More on ${day(usage.credits.resetsAt, false)}`
    }
  }
}

/** The account as the home base sees it. `configured`: this build signs in to Duet's server. */
export type AccountState = {
  configured: boolean
  user: { email: string } | null
  usage: Usage | null
  /** The sentence for a cap reached, since the last time the meters were read. */
  capped?: string
}
