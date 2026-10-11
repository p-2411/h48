// Data that crosses the preload boundary for the conversation about a line (the side panel). Keep provider-specific Live events out of
// this file: the renderer owns those, while these types describe only Duet's trusted app actions.
import type { CardDetail, Rating } from './cards'

export type ReviewRating = Rating
export type TutorCard = CardDetail

export type ReviewPreview = {
  rating: ReviewRating
  due: number
  intervalLabel: string
}

export type PendingTutorAction =
  | {
      id: string
      kind: 'save-card'
      expiresAt: string
      draft: {
        expression: string
        meaning: string
        target: string
        context: string[]
        source: 'video' | 'tutor'
      }
    }
  | {
      id: string
      kind: 'review-card'
      expiresAt: string
      card: TutorCard
      previews: ReviewPreview[]
    }

export type TutorActionResult = {
  actionId: string
  kind: 'saved-card' | 'reviewed-card' | 'opened-existing' | 'undone'
  message: string
  card?: TutorCard
}

export type TutorSessionOffer = { sdp: string }
export type TutorSessionAnswer = { sessionId: string; sdp: string }

export type TutorToolRequest = {
  callId: string
  name: string
  arguments: unknown
}

export type TutorToolResult = {
  ok: boolean
  output: string
}
