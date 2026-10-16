/** "1:51" from seconds. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/** "today", "yesterday", "3 days ago", "last week", "2 weeks ago", then the date. */
export function ago(ms: number, now = Date.now()): string {
  const day = 86400000
  const start = new Date(now).setHours(0, 0, 0, 0)
  if (ms >= start) return 'today'
  const days = Math.ceil((start - ms) / day)
  if (days <= 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** "12 Oct, 14:05". */
export function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
