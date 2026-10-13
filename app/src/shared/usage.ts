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
  return (cap === 'credits' || cap === 'hours') && typeof (value as CapReached).resets_at === 'string'
}

/** "You've used this month's Duet credits. More come on 1 November." `timeZone` is for tests. */
export function capSentence(reached: CapReached, timeZone?: string): string {
  if (reached.blocked) return 'Free Duet is limited to two accounts on one computer. Upgrade to go on.'
  const when = new Date(reached.resets_at)
  if (reached.cap === 'hours') {
    const day = when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone })
    return `You’ve used your watch hours. More come on ${day.replace(',', '')}.`
  }
  const day = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone })
  return `You’ve used this month’s Duet credits. More come on ${day}.`
}
