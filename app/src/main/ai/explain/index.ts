// The Explain that task on top of any StructuredModel. The reply is checked against the line before
// it is shown: a quote that is not in the line loses its highlight rather than pointing at words
// that are not there.
import type { Explanation } from '../../../shared/explain'
import type { Moment } from '../../../shared/moment'
import type { StructuredModel } from '../structured'
import type { Delivery } from '../voice/types'
import {
  EXPLAIN_VERSION,
  ExplanationOutputSchema,
  explainInput,
  explainInstructions
} from './prompt'

export class Explainer {
  constructor(private readonly model: StructuredModel) {}

  get name(): string {
    return this.model.name
  }

  /** `delivery` is how the line was said, when it could be heard. */
  async explain(moment: Moment, delivery?: Delivery, signal?: AbortSignal): Promise<Explanation> {
    const output = await this.model.complete(
      {
        instructions: explainInstructions(moment.language),
        input: explainInput(moment, delivery),
        schema: ExplanationOutputSchema,
        name: `explain_${moment.language}`,
        pace: 'careful'
      },
      signal
    )
    const line = moment.line.original.toLocaleLowerCase()
    const inLine = (text: string): boolean => !!text.trim() && line.includes(text.trim().toLocaleLowerCase())
    return {
      meaning: output.meaning,
      heard: delivery ? { spokenLanguage: delivery.spokenLanguage } : undefined,
      notice: output.notice
        ? { text: output.notice.text, quote: inLine(output.notice.quote) ? output.notice.quote.trim() : undefined }
        : undefined,
      why: output.why ?? undefined,
      alternative: output.alternative ?? undefined,
      limitation: output.limitation ?? undefined,
      card: { ...output.card, situation: output.card.situation.trim() },
      model: this.model.name,
      version: EXPLAIN_VERSION
    }
  }
}
