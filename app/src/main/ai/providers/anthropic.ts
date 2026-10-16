// StructuredModel backed by the Anthropic API. The only text-model file that imports Anthropic's SDK.
//
// Caching: the instructions and the context form a prefix that only ever grows at the end. A cache
// breakpoint sits on the last context block, so each request reads everything before it from the
// cache and pays in full only for the newest part. Context is sent as text, never as replayed
// model turns, so it can be trimmed without breaking anything the API checks.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { ModelError } from '../errors'
import { reportModelFailure } from '../report'
import type { StructuredModel, StructuredRequest } from '../structured'

// Quick work (a subtitle line) needs little thought, and the learner is waiting.
const EFFORT = { quick: 'low', careful: 'medium' } as const

export class AnthropicStructuredModel implements StructuredModel {
  readonly name: string
  private readonly client: Anthropic

  constructor(
    private readonly model: string,
    apiKey?: string
  ) {
    this.name = `anthropic/${model}`
    // Without a key the SDK falls back to ANTHROPIC_API_KEY or an `ant auth login` profile.
    this.client = new Anthropic(apiKey ? { apiKey } : {})
  }

  async complete<T>(request: StructuredRequest<T>, signal?: AbortSignal): Promise<T> {
    const context = request.context ?? []
    const blocks: Anthropic.Beta.BetaTextBlockParam[] = context.map((text, index) => ({
      type: 'text',
      text,
      ...(index === context.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {})
    }))
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 8000,
          // On a policy decline, the API retries on Anthropic's recommended fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: request.instructions, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: EFFORT[request.pace], format: betaZodOutputFormat(request.schema as never) },
          messages: [{ role: 'user', content: [...blocks, { type: 'text', text: request.input }] }]
        },
        { signal }
      )
      if (response.stop_reason === 'refusal') throw new ModelError('The model declined this request.', 'refusal')
      if (!response.parsed_output) throw new ModelError('The model returned no usable result.', 'invalid_output')
      return response.parsed_output as T
    } catch (error) {
      reportModelFailure({ provider: 'anthropic', model: this.model, task: request.name }, error)
      if (error instanceof ModelError) throw error
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
        throw new ModelError('The Anthropic API key was rejected.', 'auth')
      if (error instanceof Anthropic.RateLimitError) throw new ModelError('Rate limited by Anthropic.', 'rate_limit')
      if (error instanceof Anthropic.APIConnectionError) throw new ModelError('Could not reach Anthropic.', 'network')
      throw error
    }
  }
}
