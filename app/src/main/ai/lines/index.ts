// The line task on top of any StructuredModel: earlier lines go as cached context, the new lines
// as input, and the reply's phrases are aligned into word tokens (align.ts).
import type { StructuredModel } from '../structured'
import { alignLines } from './align'
import { formatHistory, formatNewLines, LinesOutputSchema, systemPrompt } from './prompt'
import type { LineModel, LinesRequest, ProcessedLine } from './types'

export * from './types'

export class Lines implements LineModel {
  constructor(private readonly model: StructuredModel) {}

  get name(): string {
    return this.model.name
  }

  async processLines({ language, lines, history }: LinesRequest, signal?: AbortSignal): Promise<ProcessedLine[]> {
    const output = await this.model.complete(
      {
        instructions: systemPrompt(language),
        context: history.map(formatHistory),
        input: formatNewLines(lines),
        schema: LinesOutputSchema,
        name: `lines_${language}`,
        pace: 'quick'
      },
      signal
    )
    return alignLines(lines, output)
  }
}
