// The bookkeeping behind a turn's English meaning and romanisation. Both are paid model calls, so
// each turn's text is asked for once; a voice turn that grows is asked for again, and an answer for
// its older text is dropped. Kept free of React so scripts/test-conversation.mjs can check it.
import { say } from '../components/errors'

export type Aid = { source: string; loading: boolean; text?: string; error?: string }
export type Aids = Record<string, Aid>

/**
 * Makes `request(id, text, fetcher)` for one kind of aid, writing into `update` (a state setter).
 * With `retry`, a failure lets the next request for the same text ask again (the learner presses
 * Meaning again). Without it the failure stays, because romanisation asks by itself and must not
 * loop on paid calls.
 */
export function aidRequester(
  update: (change: (current: Aids) => Aids) => void,
  { fallback, retry }: { fallback: string; retry: boolean }
): (id: string, source: string, fetcher: (text: string) => Promise<string>) => void {
  // The text each turn was last asked for.
  const asked = new Map<string, string>()
  const settle = (id: string, source: string, aid: Aid): void =>
    update((current) => (current[id]?.source === source ? { ...current, [id]: aid } : current))
  return (id, source, fetcher) => {
    if (asked.get(id) === source) return
    asked.set(id, source)
    update((current) => ({ ...current, [id]: { source, loading: true } }))
    fetcher(source)
      .then((text) => settle(id, source, { source, loading: false, text }))
      .catch((error: unknown) => {
        if (retry && asked.get(id) === source) asked.delete(id)
        settle(id, source, { source, loading: false, error: say(error, fallback) })
      })
  }
}
