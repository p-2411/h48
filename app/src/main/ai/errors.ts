// The one error every model in src/main/ai throws, whatever the provider or the task (lines, voice),
// so callers handle failures without knowing which provider is in use.
export class ModelError extends Error {
  constructor(
    message: string,
    /** Decides what the user is told. */
    readonly kind: 'refusal' | 'invalid_output' | 'auth' | 'rate_limit' | 'network'
  ) {
    super(message)
  }
}
