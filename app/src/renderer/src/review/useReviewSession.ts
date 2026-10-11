// The review session behind the Review tab: the queue, whether the answer is shown, the settings,
// and each action (rate, skip, undo), one at a time.
import { useCallback, useEffect, useState } from 'react'
import type { ReviewQueue, ReviewSettings } from '../../../shared/cards'
import { say } from '../components/errors'
import { mightHaveNoCards } from './queue'

export type ReviewSession = {
  /** Undefined until the session has started. */
  queue?: ReviewQueue
  /** There are no cards at all (not just none due). */
  noCards: boolean
  /** Why the session could not start; Try again calls `start`. */
  loadError?: string
  start: () => void
  revealed: boolean
  reveal: () => void
  busy: boolean
  /** Why the last action failed. */
  error?: string
  act: (work: () => Promise<ReviewQueue>) => Promise<void>
  settings?: ReviewSettings
  setSettings: (settings: ReviewSettings) => void
  saveSettings: (change: ReviewSettings) => void
}

export function useReviewSession(): ReviewSession {
  const [queue, setQueue] = useState<ReviewQueue>()
  const [noCards, setNoCards] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [settings, setSettings] = useState<ReviewSettings>()

  const show = useCallback(async (next: ReviewQueue) => {
    // Nothing due, new or coming can still mean paused cards or today's new cards used up, so ask
    // whether there is any card before saying there are none. If that check fails, assume there are.
    const none =
      mightHaveNoCards(next) &&
      (await window.duet.cards.list({ limit: 1 }).catch(() => undefined))?.length === 0
    setQueue(next)
    setNoCards(none)
    setRevealed(false)
  }, [])

  const act = useCallback(
    async (work: () => Promise<ReviewQueue>) => {
      setBusy(true)
      setError(undefined)
      try {
        await show(await work())
      } catch (failure) {
        setError(say(failure, 'That did not work.'))
        // The queue may have moved on (a card no longer due); show where it is now.
        await window.duet.cards.reviewQueue().then(show, () => undefined)
      } finally {
        setBusy(false)
      }
    },
    [show]
  )

  const load = useCallback(() => {
    window.duet.cards
      .startReview()
      .then(show)
      .catch((failure) => setLoadError(say(failure, 'Review could not start.')))
    // Without settings the session still works; the settings section just stays hidden.
    window.duet.cards.getSettings().then(setSettings, () => undefined)
  }, [show])

  useEffect(load, [load])

  // Try again: back to Loading… while it starts once more.
  const start = (): void => {
    setLoadError(undefined)
    load()
  }

  // New settings apply from the next card shown, so the queue is loaded again.
  const saveSettings = (change: ReviewSettings): void => {
    window.duet.cards.setSettings(change).then(
      (saved) => {
        setSettings(saved)
        void act(() => window.duet.cards.reviewQueue())
      },
      (failure) => setError(say(failure, 'Your review settings could not be saved.'))
    )
  }

  return {
    queue,
    noCards,
    loadError,
    start,
    revealed,
    reveal: () => setRevealed(true),
    busy,
    error,
    act,
    settings,
    setSettings,
    saveSettings
  }
}
