// The tutor's text model (the one behind GPT-Live's tools, src/main/tutor/live.ts) for small jobs
// answered in one go: the challenges' quiz (src/main/challenges/quiz.ts) and finding where scenes
// end (src/main/checkpoints/scenes.ts).
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses'
import { backendModel, safeLiveError } from '../tutor/live'
import { openAIAccess, openAIClient } from './access'

export type TextRequest = {
  instructions: string
  /** Untrusted text (lines from a video, the learner's answers) goes here, never in the instructions. */
  input: string
  /** A JSON schema the answer must follow; plain text without one. */
  format?: ResponseFormatTextJSONSchemaConfig
  maxTokens: number
  /** What failed, for the error ("Could not ask about this line"). */
  context: string
}

/** Asks the model; the answer's text, never empty. */
export type TextModel = (request: TextRequest) => Promise<string>

/** The text model, or undefined with no way to reach OpenAI (no development key, no Duet server). */
export function textModel(env: NodeJS.ProcessEnv = process.env): TextModel | undefined {
  const access = openAIAccess(env)
  if (!access) return undefined
  return async ({ instructions, input, format, maxTokens, context }) => {
    try {
      const response = await openAIClient(access).responses.create({
        model: backendModel(env),
        store: false,
        instructions,
        input,
        ...(format && { text: { format } }),
        max_output_tokens: maxTokens,
        reasoning: { effort: 'low' }
      }, { headers: { 'x-duet-feature': 'challenge' } })
      const text = response.output_text.trim()
      if (!text) throw new Error('EMPTY_ANSWER')
      return text
    } catch (error) {
      throw safeLiveError(error, context)
    }
  }
}
