// StructuredModel backed by the OpenAI API. The only text-model file that imports OpenAI's SDK.
//
// Caching: OpenAI caches long repeated prompt prefixes automatically. The instructions come first
// and the context follows in order, so each request repeats the previous one's prefix and only the
// newest part is new. prompt_cache_key keeps one task's requests on the same cache.
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { openAIClient, type OpenAIAccess } from '../access'
import { duetModelError, ModelError } from '../errors'
import type { StructuredModel, StructuredRequest } from '../structured'

export class OpenAIStructuredModel implements StructuredModel {
  readonly name: string
  private readonly client: OpenAI

  constructor(
    private readonly model: string,
    access: OpenAIAccess,
    /** Reasoning effort per pace. Lower is faster; a subtitle line needs little. */
    private readonly effort: Record<StructuredRequest<unknown>['pace'], OpenAI.ReasoningEffort>
  ) {
    this.name = `openai/${model}`
    this.client = openAIClient(access)
  }

  async complete<T>(request: StructuredRequest<T>, signal?: AbortSignal): Promise<T> {
    const parts = [...(request.context ?? []), request.input].map((text) => ({ type: 'input_text' as const, text }))
    try {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          instructions: request.instructions,
          input: [{ role: 'user', content: parts }],
          text: { format: zodTextFormat(request.schema as never, request.name) },
          reasoning: { effort: this.effort[request.pace] },
          prompt_cache_key: `duet-${request.name}`
        },
        // Duet's server meters each feature ("lines_es" is lines): lines run only while watching.
        { signal, headers: { 'x-duet-feature': request.name.split('_')[0] } }
      )
      if (!response.output_parsed) {
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal')
        )
        throw refused
          ? new ModelError('The model declined this request.', 'refusal')
          : new ModelError('The model returned no usable result.', 'invalid_output')
      }
      return response.output_parsed as T
    } catch (error) {
      if (error instanceof ModelError) throw error
      const duet = duetModelError(error)
      if (duet) throw duet
      if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
        throw new ModelError('The OpenAI API key was rejected.', 'auth')
      if (error instanceof OpenAI.RateLimitError) throw new ModelError('Rate limited by OpenAI.', 'rate_limit')
      if (error instanceof OpenAI.APIConnectionError) throw new ModelError('Could not reach OpenAI.', 'network')
      throw error
    }
  }
}
