// How the rest of the window tells Duet (in the home bar) that something happened, so it can react:
// a card or a challenge got right, one not yet, or today's session finished.
export const DUET_REACT = 'duet:react'
export type DuetReaction = 'right' | 'not-yet' | 'done'

export function duetReact(reaction: DuetReaction): void {
  window.dispatchEvent(new CustomEvent<DuetReaction>(DUET_REACT, { detail: reaction }))
}
