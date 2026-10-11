// Text replies in the conversation about a line: the Responses model the voice session hands its
// reasoning and tools to, talking to the learner itself in a text chat. Its tool calls run through
// the tutor (index.ts), so the same rules hold as in voice: the learner alone confirms a save or a
// rating.
import type { ResponseInput } from 'openai/resources/responses/responses'
import { backendModel, openai, safeLiveError, tools } from './live'
import { lineContext, textInstructions, type LineContext } from './prompts'

// A reply may need a few tool calls (search, then open a card); more than this is a loop.
const MAX_TOOL_ROUNDS = 4

const textTools = tools.map((tool) => ({
  type: 'function' as const,
  name: tool.name,
  description: tool.description ?? null,
  parameters: tool.parameters ?? null,
  strict: tool.strict ?? true
}))

/** Runs one tool call and gives its JSON output, as the voice session's tool calls do. */
export type ToolRunner = (name: string, args: unknown) => Promise<string>

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Duet's reply to the learner's message; `context` holds the line and the conversation so far. */
export async function replyInText(
  context: LineContext,
  message: string,
  runTool: ToolRunner,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new Error('Add OPENAI_API_KEY to app/.env.local to talk with Duet.')
  const client = openai(env.OPENAI_API_KEY)
  const input: ResponseInput = [
    { role: 'developer', content: `Line context: ${lineContext(context)}` },
    { role: 'user', content: message }
  ]
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.responses.create({
        model: backendModel(env),
        store: false,
        instructions: textInstructions(context.moment.language),
        input,
        tools: textTools,
        parallel_tool_calls: false,
        reasoning: { effort: 'low' },
        // Nothing is stored, so the reasoning travels with the next round's input.
        include: ['reasoning.encrypted_content'],
        max_output_tokens: 1_200
      })
      const calls = response.output.filter((item) => item.type === 'function_call')
      if (!calls.length) {
        const reply = response.output_text.trim()
        if (!reply) throw new Error('EMPTY_REPLY')
        return reply
      }
      input.push(...(response.output as ResponseInput))
      for (const call of calls)
        input.push({ type: 'function_call_output', call_id: call.call_id, output: await runTool(call.name, parse(call.arguments)) })
    }
    throw new Error('Duet took too many steps to answer. Try asking again.')
  } catch (error) {
    throw safeLiveError(error, 'Could not answer')
  }
}
