// Cards in the conversation: the preview Duet prepared (save or review), the card it opened, the
// last result with its Undo, and "Use my cards". The main process sends previews, results and cards
// as they happen (from text or voice); the learner's clicks confirm, rate or undo, one at a time.
import { useEffect, useState } from 'react'
import type { PendingTutorAction, ReviewRating, TutorActionResult, TutorCard } from '../../../shared/tutor'
import { say } from '../components/errors'
import { exclusive } from './exclusive'

// How long Duet looks pleased after a card is saved or a review counted.
const CHEER_MS = 2_000

/** `explored`: whether the cards start open to Duet (they do in Talk). */
export function useCardActions(explored = false): {
  card?: TutorCard
  pending?: PendingTutorAction
  result?: TutorActionResult
  actionError?: string
  /** The learner opened their saved cards to Duet. */
  explore: boolean
  cheering: boolean
  /** A confirm or undo is out; its buttons are disabled. */
  busy: boolean
  closeCard: () => void
  confirm: (rating?: ReviewRating) => void
  undo: () => void
  openCards: () => void
} {
  const [card, setCard] = useState<TutorCard>()
  const [pending, setPending] = useState<PendingTutorAction>()
  const [result, setResult] = useState<TutorActionResult>()
  const [actionError, setActionError] = useState<string>()
  const [explore, setExplore] = useState(explored)
  const [cheering, setCheering] = useState(false)
  const [busy, setBusy] = useState(false)
  const [run] = useState(() => exclusive(setBusy))

  useEffect(() => {
    if (!cheering) return
    const timer = window.setTimeout(() => setCheering(false), CHEER_MS)
    return () => window.clearTimeout(timer)
  }, [cheering])

  useEffect(() => {
    const offCard = window.duet.tutor.onCard(setCard)
    const offPending = window.duet.tutor.onPendingAction((action) => {
      setPending(action)
      setActionError(undefined)
    })
    const offResult = window.duet.tutor.onActionResult((next) => {
      setResult(next)
      if (next.kind === 'saved-card' || next.kind === 'reviewed-card') setCheering(true)
      setPending(undefined)
      setActionError(undefined)
      if (next.kind === 'saved-card' || (next.kind === 'undone' && !next.card)) setCard(undefined)
    })
    return () => {
      offCard()
      offPending()
      offResult()
    }
  }, [])

  const confirm = (rating?: ReviewRating): void => {
    if (!pending) return
    const { id } = pending
    void run(async () => {
      try {
        setResult(await window.duet.tutor.confirmAction(id, rating))
        setPending(undefined)
      } catch (error) {
        setActionError(say(error, 'Could not confirm that.'))
      }
    })
  }

  const undo = (): void => {
    void run(async () => {
      try {
        setResult(await window.duet.tutor.undo())
      } catch (error) {
        setActionError(say(error, 'Could not undo that.'))
      }
    })
  }

  const openCards = (): void => {
    window.duet.tutor
      .setExplore(true)
      .then(setExplore)
      .catch((error: unknown) => setActionError(say(error, 'Could not open your saved cards to Duet.')))
  }

  return { card, pending, result, actionError, explore, cheering, busy, closeCard: () => setCard(undefined), confirm, undo, openCards }
}
