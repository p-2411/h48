// The one error every model in src/main/ai throws, whatever the provider or the task (lines, voice),
// so callers handle failures without knowing which provider is in use.
import { capSentence, isCapReached } from '../../shared/usage'

export class ModelError extends Error {
  constructor(
    message: string,
    /** Decides what the user is told. `quota`: a cap on Duet's server is reached (not tried again). */
    readonly kind: 'refusal' | 'invalid_output' | 'auth' | 'rate_limit' | 'network' | 'quota'
  ) {
    super(message)
  }
}

/** Duet's server's own refusals (an OpenAI SDK error with `type: 'duet'`) as a ModelError: a cap
 * reached, or the learner signed out. Undefined for anything else, OpenAI's own errors included. */
export function duetModelError(error: unknown): ModelError | undefined {
  const { status, error: body } = (error ?? {}) as { status?: number; error?: { type?: string; code?: string } }
  if (body?.type !== 'duet') return undefined
  if (status === 402 && body.code === 'usage_cap' && isCapReached(body)) return new ModelError(capSentence(body), 'quota')
  if (status === 401) return new ModelError('Sign in to Duet to use this.', 'auth')
  return undefined
}
