// LineModel backed by the OpenAI API. The only file that imports OpenAI's SDK.
//
// Caching: OpenAI caches long repeated prompt prefixes automatically. The instructions come first
// and the earlier lines follow in order, so each request repeats the previous one's prefix and only
// the newest line is new. prompt_cache_key keeps one session's requests on the same cache.
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { alignLines } from './align'
import { formatHistory, formatNewLines, LinesOutputSchema, systemPrompt } from './prompt'
import { ModelError, type LineModel, type LinesRequest, type ProcessedLine } from './types'

export class OpenAILineModel implements LineModel {
  readonly name: string
  private readonly client: OpenAI

  constructor(
    private readonly model: string,
    apiKey?: string,
    /** How much the model reasons before answering. Lower is faster; a subtitle line needs little. */
    private readonly effort?: OpenAI.ReasoningEffort
  ) {
    this.name = `openai/${model}`
    // Without a key the SDK falls back to OPENAI_API_KEY.
    this.client = new OpenAI(apiKey ? { apiKey } : {})
  }

  async processLines({ language, lines, history }: LinesRequest, signal?: AbortSignal): Promise<ProcessedLine[]> {
    try {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          instructions: systemPrompt(language),
          input: [
            {
              role: 'user',
              content: [
                ...history.map((entry) => ({ type: 'input_text' as const, text: formatHistory(entry) })),
                { type: 'input_text' as const, text: formatNewLines(lines) }
              ]
            }
          ],
          text: { format: zodTextFormat(LinesOutputSchema, 'processed_lines') },
          ...(this.effort ? { reasoning: { effort: this.effort } } : {}),
          prompt_cache_key: `duet-lines-${language}`
        },
        { signal }
      )
      if (!response.output_parsed) {
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal')
        )
        throw refused
          ? new ModelError('The model declined these lines.', 'refusal')
          : new ModelError('The model returned no usable result.', 'invalid_output')
      }
      return alignLines(lines, response.output_parsed)
    } catch (error) {
      if (error instanceof ModelError) throw error
      if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
        throw new ModelError('The OpenAI API key was rejected.', 'auth')
      if (error instanceof OpenAI.RateLimitError) throw new ModelError('Rate limited by OpenAI.', 'rate_limit')
      if (error instanceof OpenAI.APIConnectionError) throw new ModelError('Could not reach OpenAI.', 'network')
      throw error
    }
  }
}
