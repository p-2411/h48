// LineModel backed by the Anthropic API. The only file that imports Anthropic's SDK.
//
// Caching: the system prompt and the earlier lines form a prefix that only ever grows at the end.
// A cache breakpoint sits on the last earlier line, so each request reads everything before it from
// the cache and pays in full only for the newest line. Earlier lines are sent as text with their
// translations, never as replayed model turns, so the history can be trimmed without breaking
// anything the API checks.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { alignLine } from './align'
import { formatHistory, formatNewLine, LineOutputSchema, systemPrompt } from './prompt'
import { LineModelError, type LineModel, type LineRequest, type ProcessedLine } from './types'

export class AnthropicLineModel implements LineModel {
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

  async processLine({ language, line, history }: LineRequest, signal?: AbortSignal): Promise<ProcessedLine> {
    const earlier: Anthropic.Beta.BetaTextBlockParam[] = history.map((entry, index) => ({
      type: 'text',
      text: formatHistory(entry),
      ...(index === history.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {})
    }))
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 8000,
          // On a policy decline, the API retries on Anthropic's recommended fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: systemPrompt(language), cache_control: { type: 'ephemeral' } }],
          // Low effort: the work per line is small and the reader is waiting.
          output_config: { effort: 'low', format: betaZodOutputFormat(LineOutputSchema) },
          messages: [{ role: 'user', content: [...earlier, { type: 'text', text: formatNewLine(line) }] }]
        },
        { signal }
      )
      if (response.stop_reason === 'refusal') throw new LineModelError('The model declined this line.', 'refusal')
      if (!response.parsed_output) throw new LineModelError('The model returned no usable result.', 'invalid_output')
      return alignLine(line, response.parsed_output.translation, response.parsed_output.phrases)
    } catch (error) {
      if (error instanceof LineModelError) throw error
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
        throw new LineModelError('The Anthropic API key was rejected.', 'auth')
      if (error instanceof Anthropic.RateLimitError) throw new LineModelError('Rate limited by Anthropic.', 'rate_limit')
      if (error instanceof Anthropic.APIConnectionError) throw new LineModelError('Could not reach Anthropic.', 'network')
      throw error
    }
  }
}
