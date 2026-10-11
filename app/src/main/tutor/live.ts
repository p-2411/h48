// Creates GPT-Live WebRTC sessions in the trusted Electron main process. The renderer supplies only
// an SDP offer and receives only the SDP answer/session id, so the project API key never crosses
// the preload boundary. The client, the backend model, the tools and the error messages here are
// shared with text replies (text.ts).
import OpenAI from 'openai'
import type { FunctionTool } from 'openai/resources/live/live'
import { RATINGS } from '../../shared/cards'
import type { TutorSessionAnswer } from '../../shared/tutor'
import { languageModule, languageName, type Language } from '../../shared/languages'
import { backendInstructions, lineContext, liveInstructions, type LineContext } from './prompts'

const readingCache = new Map<string, string>()

// One client per API key: a new client for each call would set up its connection again.
let cachedClient: { apiKey: string; client: OpenAI } | undefined

export function openai(apiKey: string): OpenAI {
  if (cachedClient?.apiKey !== apiKey) cachedClient = { apiKey, client: new OpenAI({ apiKey }) }
  return cachedClient.client
}

/** The text model behind the voice: it runs the tools, and it translates and romanises. */
export function backendModel(env: NodeJS.ProcessEnv): string {
  return env.DUET_LIVE_BACKEND_MODEL || 'gpt-6-luna'
}

const emptyObject = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false
} as const

export const tools: FunctionTool[] = [
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
      'Search local learning cards only after the learner opens their saved cards to Duet (the Use my cards button) and has attempted recall.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Expression in the language being learnt, English meaning or learning target.'
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
      'After the learner opens their saved cards to Duet (the Use my cards button), open a known local card and its stored nuance visibly.',
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
        rating: { type: 'string', enum: [...RATINGS] }
      },
      required: ['actionId', 'rating'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'undo_last_action',
    description:
      'Undo the latest save or review made in this conversation after the learner asks to undo.',
    strict: true,
    parameters: emptyObject
  }
]

/** An error the learner can read. `context` says what failed, such as "Could not translate". */
export function safeLiveError(error: unknown, context: string): Error {
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
    return new Error('The OpenAI project key was rejected or does not have GPT-Live access.')
  if (error instanceof OpenAI.RateLimitError)
    return new Error('The OpenAI project is rate limited. Wait a moment and try again.')
  if (error instanceof OpenAI.APIConnectionError)
    return new Error('Could not reach OpenAI. Check the network connection and try again.')
  if (error instanceof Error) return new Error(`${context}: ${error.message}`)
  return new Error(`${context}.`)
}

export async function createLiveSession(
  sdp: string,
  context: LineContext,
  env: NodeJS.ProcessEnv = process.env
): Promise<TutorSessionAnswer> {
  if (!env.OPENAI_API_KEY)
    throw new Error('Add OPENAI_API_KEY to app/.env.local to start voice.')
  if (!sdp.trim() || sdp.length > 100_000) throw new Error('INVALID_SDP_OFFER')

  const client = openai(env.OPENAI_API_KEY)
  const { language } = context.moment
  try {
    const result = await client.live.create({
      session: {
        model: 'gpt-live-1',
        store: false,
        audio: { output: { voice: env.DUET_LIVE_VOICE || 'marin' } },
        instructions: liveInstructions(language),
        input: [
          {
            type: 'message',
            role: 'developer',
            content: [{ type: 'input_text', text: `Line context: ${lineContext(context)}` }]
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
            model: backendModel(env),
            instructions: backendInstructions(language),
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
    throw safeLiveError(error, 'Could not start voice')
  }
}

/** A short visual aid for the reveal button. It is never spoken automatically by GPT-Live. */
export async function translateForLearner(
  text: string,
  language: Language,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const input = text.trim()
  if (!input || input.length > 2_000) throw new Error('INVALID_TRANSLATION_TEXT')
  if (!env.OPENAI_API_KEY)
    throw new Error('Add OPENAI_API_KEY to app/.env.local to reveal a translation.')

  const client = openai(env.OPENAI_API_KEY)
  try {
    const response = await client.responses.create({
      model: backendModel(env),
      store: false,
      instructions:
        `Translate the ${languageName(language)} Duet just spoke into concise, natural English for a learner. Return only the translation. Preserve uncertainty and tone; do not add notes, romanisation, labels or quotation marks.`,
      input,
      // A plain rewrite needs no reasoning; with it on, reasoning used up the budget and long turns
      // came back empty.
      max_output_tokens: 1_200,
      reasoning: { effort: 'none' }
    })
    const translation = response.output_text.trim()
    if (!translation) throw new Error('EMPTY_TRANSLATION')
    return translation
  } catch (error) {
    throw safeLiveError(error, 'Could not translate')
  }
}

/**
 * A silent reading aid shown below transcript text in a language not written in Latin letters (its
 * romanisation); the voice never reads it by default.
 */
export async function romaniseForLearner(
  text: string,
  language: Language,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const input = text.trim()
  if (!input || input.length > 2_000) throw new Error('INVALID_READING_TEXT')
  const reading = languageModule(language).reading
  if (!reading) throw new Error('NO_READING_NEEDED')
  const key = `${language}:${input}`
  const cached = readingCache.get(key)
  if (cached) return cached
  if (!env.OPENAI_API_KEY)
    throw new Error(`Add OPENAI_API_KEY to app/.env.local to show ${reading.name}.`)

  const client = openai(env.OPENAI_API_KEY)
  try {
    const response = await client.responses.create({
      model: backendModel(env),
      store: false,
      instructions: reading.instructions,
      input,
      // A plain rewrite needs no reasoning; with it on, reasoning used up the budget and long turns
      // came back empty.
      max_output_tokens: 1_200,
      reasoning: { effort: 'none' }
    })
    const romanised = response.output_text.trim()
    if (!romanised) throw new Error('EMPTY_READING')
    readingCache.set(key, romanised)
    if (readingCache.size > 200)
      readingCache.delete(readingCache.keys().next().value as string)
    return romanised
  } catch (error) {
    throw safeLiveError(error, 'Could not show the romanisation')
  }
}
