// Picks the voice models from settings. To add a provider, write one file implementing the
// interfaces in types.ts and add a case here; nothing else in the app changes.
//
// Settings, from the environment (in development, app/.env.local):
//   DUET_VOICE_PROVIDER  openai (the only one so far, and the default)
//   DUET_STT_MODEL       speech to text; default gpt-4o-transcribe
//   DUET_LISTEN_MODEL    hears how a video's line is said, for Explain; default gpt-audio-1.5
//   OPENAI_API_KEY
import { OpenAIDeliveryListener, OpenAISpeechToText } from './openai'
import type { DeliveryListener, SpeechToText } from './types'

export * from './types'

export type VoiceModels = { speechToText: SpeechToText; listener: DeliveryListener }

export function createVoiceModels(env: NodeJS.ProcessEnv = process.env): VoiceModels {
  const provider = env.DUET_VOICE_PROVIDER?.toLowerCase() ?? 'openai'
  switch (provider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) throw new Error('Add OPENAI_API_KEY to app/.env.local to hear videos.')
      return {
        speechToText: new OpenAISpeechToText(env.DUET_STT_MODEL || 'gpt-4o-transcribe', env.OPENAI_API_KEY),
        listener: new OpenAIDeliveryListener(env.DUET_LISTEN_MODEL || 'gpt-audio-1.5', env.OPENAI_API_KEY)
      }
    default:
      throw new Error(`Unknown voice provider "${provider}". Supported: openai.`)
  }
}
