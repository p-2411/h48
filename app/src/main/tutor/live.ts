// Creates GPT-Live WebRTC sessions in the trusted Electron main process. The renderer supplies only
// an SDP offer and receives only the SDP answer/session id, so the project API key never crosses
// the preload boundary.
import OpenAI from 'openai'
import type { FunctionTool } from 'openai/resources/live/live'
import type { Moment } from '../../shared/moment'
import type { TutorSessionAnswer } from '../../shared/tutor'
import { BACKEND_INSTRUCTIONS, LIVE_INSTRUCTIONS, momentContext } from './prompts'

const pronunciationCache = new Map<string, string>()

const emptyObject = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false
} as const

const tools: FunctionTool[] = [
  {
    type: 'function',
    name: 'get_current_moment',
    description:
      'Return the frozen video line and bounded dialogue that this tutor session is attached to.',
    strict: true,
    parameters: emptyObject
  },
  {
    type: 'function',
    name: 'search_cards',
    description:
      'Search local learning cards only after the learner pressed Explore further and recall has been attempted.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Japanese expression, English meaning or learning target.'
        },
        limit: { type: 'integer', minimum: 1, maximum: 10 }
      },
      required: ['query', 'limit'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'open_card',
    description:
      'After Explore further is enabled, open a known local card and its stored nuance visibly.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { cardId: { type: 'string' } },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'prepare_save_card',
    description:
      'Prepare and visibly preview one card. This does not save; ask for explicit confirmation afterward.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
        meaning: { type: 'string' },
        target: { type: 'string', description: 'The single distinction this card tests.' },
        context: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        source: { type: 'string', enum: ['video', 'tutor'] }
      },
      required: ['expression', 'meaning', 'target', 'context', 'source'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'confirm_save_card',
    description:
      'Commit a previously prepared save only after the learner explicitly confirms it in a later turn.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { actionId: { type: 'string' } },
      required: ['actionId'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'preview_review',
    description:
      'Show the scheduler intervals and prepare a review. This does not change the card.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { cardId: { type: 'string' } },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'commit_review',
    description:
      'Commit an explicit learner-selected Again, Hard, Good or Easy rating for a prepared review.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        actionId: { type: 'string' },
        rating: { type: 'string', enum: ['again', 'hard', 'good', 'easy'] }
      },
      required: ['actionId', 'rating'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'undo_last_action',
    description:
      'Undo the latest save or review performed in this tutor window after the learner asks to undo.',
    strict: true,
    parameters: emptyObject
  }
]

function safeLiveError(error: unknown): Error {
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
    return new Error('The OpenAI project key was rejected or does not have GPT-Live access.')
  if (error instanceof OpenAI.RateLimitError)
    return new Error('The OpenAI project is rate limited. Wait a moment and try again.')
  if (error instanceof OpenAI.APIConnectionError)
    return new Error('Could not reach OpenAI. Check the network connection and try again.')
  if (error instanceof Error) return new Error(`Could not start the voice tutor: ${error.message}`)
  return new Error('Could not start the voice tutor.')
}

export async function createLiveSession(
  sdp: string,
  moment: Moment,
  env: NodeJS.ProcessEnv = process.env
): Promise<TutorSessionAnswer> {
  if (!env.OPENAI_API_KEY)
    throw new Error('Add OPENAI_API_KEY to app/.env.local to start the voice tutor.')
  if (!sdp.trim() || sdp.length > 100_000) throw new Error('INVALID_SDP_OFFER')
  if (moment.language !== 'ja')
    throw new Error('The voice tutor currently supports Japanese practice only.')

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  try {
    const result = await client.live.create({
      session: {
        model: 'gpt-live-1',
        store: false,
        audio: { output: { voice: env.DUET_LIVE_VOICE || 'marin' } },
        instructions: LIVE_INSTRUCTIONS,
        input: [
          {
            type: 'message',
            role: 'developer',
            content: [{ type: 'input_text', text: `Current Duet moment: ${momentContext(moment)}` }]
          }
        ],
        client: {
          data_channel: {
            allowed_client_events: [
              'session.input_audio.mute',
              'session.input_audio.unmute',
              'session.instructions.append',
              'session.commentary.append',
              'response.item.create',
              'response.create',
              'session.close'
            ],
            allowed_server_events: 'all'
          }
        },
        delegation: {
          type: 'responses',
          responses: {
            model: env.DUET_LIVE_BACKEND_MODEL || 'gpt-6-luna',
            instructions: BACKEND_INSTRUCTIONS,
            max_output_tokens: 1_200,
            parallel_tool_calls: false,
            reasoning: { effort: 'low' },
            tool_choice: 'auto',
            tools
          }
        }
      },
      transport: { type: 'webrtc', sdp }
    })
    return { sessionId: result.session.id, sdp: result.transport.sdp }
  } catch (error) {
    throw safeLiveError(error)
  }
}

/** A short visual aid for the reveal button. It is never spoken automatically by GPT-Live. */
export async function translateForLearner(
  text: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const input = text.trim()
  if (!input || input.length > 2_000) throw new Error('INVALID_TRANSLATION_TEXT')
  if (!env.OPENAI_API_KEY)
    throw new Error('Add OPENAI_API_KEY to app/.env.local to reveal a translation.')

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  try {
    const response = await client.responses.create({
      model: env.DUET_LIVE_BACKEND_MODEL || 'gpt-6-luna',
      store: false,
      instructions:
        'Translate the Japanese Duet just spoke into concise, natural English for a learner. Return only the translation. Preserve uncertainty and tone; do not add notes, romanisation, labels or quotation marks.',
      input,
      max_output_tokens: 220,
      reasoning: { effort: 'low' }
    })
    const translation = response.output_text.trim()
    if (!translation) throw new Error('EMPTY_TRANSLATION')
    return translation
  } catch (error) {
    throw safeLiveError(error)
  }
}

/** A silent reading aid shown below Japanese transcript text; the voice never reads it by default. */
export async function pronounceForLearner(
  text: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const input = text.trim()
  if (!input || input.length > 2_000) throw new Error('INVALID_PRONUNCIATION_TEXT')
  const cached = pronunciationCache.get(input)
  if (cached) return cached
  if (!env.OPENAI_API_KEY)
    throw new Error('Add OPENAI_API_KEY to app/.env.local to show Japanese pronunciation.')

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  try {
    const response = await client.responses.create({
      model: env.DUET_LIVE_BACKEND_MODEL || 'gpt-6-luna',
      store: false,
      instructions:
        'Convert the Japanese text into readable Modified Hepburn romanisation for an English-speaking learner. Infer kanji readings from context. Use ordinary Latin letters, spaces and punctuation; write long vowels plainly (ou, uu) and doubled consonants accurately. Return only the romanisation. Do not translate, label, explain or add quotation marks.',
      input,
      max_output_tokens: 260,
      reasoning: { effort: 'low' }
    })
    const pronunciation = response.output_text.trim()
    if (!pronunciation) throw new Error('EMPTY_PRONUNCIATION')
    pronunciationCache.set(input, pronunciation)
    if (pronunciationCache.size > 200)
      pronunciationCache.delete(pronunciationCache.keys().next().value as string)
    return pronunciation
  } catch (error) {
    throw safeLiveError(error)
  }
}
