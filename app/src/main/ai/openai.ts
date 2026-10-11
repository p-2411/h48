// LineModel backed by the OpenAI API. The only file that imports OpenAI's SDK.
//
// Caching: OpenAI caches long repeated prompt prefixes automatically. The instructions come first
// and the earlier lines follow in order, so each request repeats the previous one's prefix and only
// the newest line is new. prompt_cache_key keeps one session's requests on the same cache.
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { alignLine } from './align'
import { formatHistory, formatNewLine, LineOutputSchema, systemPrompt } from './prompt'
import { LineModelError, type LineModel, type LineRequest, type ProcessedLine } from './types'

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

  async processLine({ language, line, history }: LineRequest, signal?: AbortSignal): Promise<ProcessedLine> {
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
                { type: 'input_text' as const, text: formatNewLine(line) }
              ]
            }
          ],
          text: { format: zodTextFormat(LineOutputSchema, 'processed_line') },
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
          ? new LineModelError('The model declined this line.', 'refusal')
          : new LineModelError('The model returned no usable result.', 'invalid_output')
      }
      return alignLine(line, response.output_parsed.translation, response.output_parsed.phrases)
    } catch (error) {
      if (error instanceof LineModelError) throw error
      if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
        throw new LineModelError('The OpenAI API key was rejected.', 'auth')
      if (error instanceof OpenAI.RateLimitError) throw new LineModelError('Rate limited by OpenAI.', 'rate_limit')
      if (error instanceof OpenAI.APIConnectionError) throw new LineModelError('Could not reach OpenAI.', 'network')
      throw error
    }
  }
}
