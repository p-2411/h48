// The one thing every text model provider does for Duet: take instructions, context and an input,
// and return an object of a known shape. Each task (lines, explanations, …) is written once on top
// of this, so adding a task never touches a provider, and adding a provider never touches a task.
import type { z } from 'zod'

export type StructuredRequest<T> = {
  /** Fixed for a task (per language), so providers can cache it. */
  instructions: string
  /** Context sent before the input, oldest first. Between requests it should only grow at its end
   * (earlier lines of a video), so everything before the newest part is read from cache. */
  context?: string[]
  input: string
  schema: z.ZodType<T>
  /** Names the output shape; also groups requests that share a cache. */
  name: string
  /** quick: the learner is watching and the answer must be fast; careful: worth more thought. */
  pace: 'quick' | 'careful'
}

export interface StructuredModel {
  /** Provider and model, for logs and settings, e.g. "openai/gpt-6-luna". */
  readonly name: string
  /** Throws ModelError when the model fails, declines or returns nothing usable. */
  complete<T>(request: StructuredRequest<T>, signal?: AbortSignal): Promise<T>
}
