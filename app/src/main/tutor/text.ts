// Text replies in the conversation about a line: the Responses model the voice session hands its
// reasoning and tools to, talking to the learner itself in a text chat. Its tool calls run through
// the tutor (index.ts), so the same rules hold as in voice: the learner alone confirms a save or a
// rating.
import type { ResponseInput } from 'openai/resources/responses/responses'
import { backendModel, safeLiveError, tools, tutorClient, TUTOR_CALL } from './live'
import { contextLanguage, contextText, textInstructions, type TutorContext } from './prompts'

// A reply may need a few tool calls (search, then open a card); more than this is a loop.
const MAX_TOOL_ROUNDS = 4

const textTools = tools.map((tool) => ({
  type: 'function' as const,
  name: tool.name,
  description: tool.description ?? null,
  parameters: tool.parameters ?? null,
  strict: tool.strict ?? true
}))

// The final answer: the reply, and whether it corrects the learner (the mascot shows a gentle
// correction for it).
const replyFormat = {
  type: 'json_schema' as const,
  name: 'duet_reply',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: 'What the learner reads: the whole reply, in plain text.'
      },
      corrects_learner: {
        type: 'boolean',
        description: 'True only when the reply points out a problem in what the learner wrote.'
      }
    },
    required: ['reply', 'corrects_learner'],
    additionalProperties: false
  }
}

/** Duet's reply in the text chat. */
export type TextReply = { text: string; correction: boolean }

/** The reply from the model's final answer; an answer not in the format is taken as the reply. */
export function readReply(output: string): TextReply {
  const answer = parse(output) as { reply?: unknown; corrects_learner?: unknown } | undefined
  if (answer && typeof answer.reply === 'string')
    return { text: answer.reply.trim(), correction: answer.corrects_learner === true }
  return { text: output.trim(), correction: false }
}

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
  context: TutorContext,
  message: string,
  runTool: ToolRunner,
  env: NodeJS.ProcessEnv = process.env
): Promise<TextReply> {
  const client = tutorClient(env, 'talk with Duet')
  const input: ResponseInput = [
    { role: 'developer', content: `Context: ${contextText(context)}` },
    { role: 'user', content: message }
  ]
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.responses.create(
        {
          model: backendModel(env),
          store: false,
          instructions: textInstructions(contextLanguage(context), 'moment' in context ? 'line' : 'free'),
          input,
          tools: textTools,
          text: { format: replyFormat },
          parallel_tool_calls: false,
          reasoning: { effort: 'low' },
          // Nothing is stored, so the reasoning travels with the next round's input.
          include: ['reasoning.encrypted_content'],
          max_output_tokens: 1_200
        },
        TUTOR_CALL
      )
      const calls = response.output.filter((item) => item.type === 'function_call')
      if (!calls.length) {
        const reply = readReply(response.output_text)
        if (!reply.text) throw new Error('EMPTY_REPLY')
        return reply
      }
      input.push(...(response.output as ResponseInput))
      for (const call of calls)
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: await runTool(call.name, parse(call.arguments))
        })
    }
    throw new Error('Duet took too many steps to answer. Try asking again.')
  } catch (error) {
    throw safeLiveError(error, 'Could not answer')
  }
}
