// An explanation of one line for the learner ("Explain that"): what it means here and the one thing
// most worth noticing. Fields the line does not need are left out rather than filled.
export type Explanation = {
  /** What the line means here, in context. */
  meaning: string
  /** The one thing most worth noticing; `quote` is the exact words of the line it is about, when they
   * could be found in the line. */
  notice?: { text: string; quote?: string }
  /** What in the wording or the earlier lines supports this reading. */
  why?: string
  /** Another way to say it, and what that changes. */
  alternative?: { expression: string; changes: string }
  /** Missing context or doubt that affects the answer. */
  limitation?: string
  /** A starting point for a card, edited before saving. */
  card: { expression: string; meaning: string; target: string; situation: string }
  /** Who wrote it: the model, and the version of the instructions it had. */
  model: string
  version: number
}
