// Picks the text model provider from settings. To add a provider, write one file implementing
// StructuredModel (see openai.ts or anthropic.ts) and add a case here; no task changes.
//
// Settings, from the environment (in development, app/.env.local):
//   DUET_AI_PROVIDER  anthropic | openai. If unset, whichever provider has a key is used,
//                     OpenAI first.
//   DUET_AI_MODEL     the provider's model id; defaults below
//   DUET_AI_EFFORT    OpenAI reasoning effort for quick work (none, low, medium…). Defaults to
//                     none: measured on gpt-6-luna with phrase output, none takes ~1.5-2.5 s a line.
//   OPENAI_API_KEY, ANTHROPIC_API_KEY
import type OpenAI from 'openai'
import type { StructuredModel } from '../structured'
import { AnthropicStructuredModel } from './anthropic'
import { OpenAIStructuredModel } from './openai'

const DEFAULT_MODELS = {
  openai: 'gpt-6-luna',
  anthropic: 'claude-opus-5-5'
} as const

type Provider = keyof typeof DEFAULT_MODELS

function pickProvider(env: NodeJS.ProcessEnv): Provider {
  const chosen = env.DUET_AI_PROVIDER?.toLowerCase()
  if (chosen) {
    if (chosen in DEFAULT_MODELS) return chosen as Provider
    throw new Error(`Unknown AI provider "${chosen}". Supported: ${Object.keys(DEFAULT_MODELS).join(', ')}.`)
  }
  if (env.OPENAI_API_KEY) return 'openai'
  if (env.ANTHROPIC_API_KEY) return 'anthropic'
  throw new Error('Add OPENAI_API_KEY or ANTHROPIC_API_KEY to app/.env.local to translate lines.')
}

export function createStructuredModel(env: NodeJS.ProcessEnv = process.env): StructuredModel {
  const provider = pickProvider(env)
  const model = env.DUET_AI_MODEL || DEFAULT_MODELS[provider]
  switch (provider) {
    case 'openai':
      return new OpenAIStructuredModel(model, env.OPENAI_API_KEY, {
        quick: (env.DUET_AI_EFFORT || 'none') as OpenAI.ReasoningEffort,
        careful: 'low'
      })
    case 'anthropic':
      return new AnthropicStructuredModel(model, env.ANTHROPIC_API_KEY)
  }
}
