// Picks the voice models from settings. To add a provider, write one file implementing the
// interfaces in types.ts and add a case here; nothing else in the app changes.
//
// Settings, from the environment (in development, app/.env.local):
//   DUET_VOICE_PROVIDER  openai (the only one so far, and the default)
//   DUET_STT_MODEL       speech to text; default gpt-4o-transcribe
//   DUET_TTS_MODEL       text to speech; default gpt-4o-mini-tts
//   DUET_TTS_VOICE       default marin
//   OPENAI_API_KEY
import { OpenAISpeechToText, OpenAITextToSpeech } from './openai'
import type { SpeechToText, TextToSpeech } from './types'

export * from './types'

export type VoiceModels = { speechToText: SpeechToText; textToSpeech: TextToSpeech }

export function createVoiceModels(env: NodeJS.ProcessEnv = process.env): VoiceModels {
  const provider = env.DUET_VOICE_PROVIDER?.toLowerCase() ?? 'openai'
  switch (provider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) throw new Error('Add OPENAI_API_KEY to app/.env.local for the voice tutor.')
      return {
        speechToText: new OpenAISpeechToText(env.DUET_STT_MODEL || 'gpt-4o-transcribe', env.OPENAI_API_KEY),
        textToSpeech: new OpenAITextToSpeech(env.DUET_TTS_MODEL || 'gpt-4o-mini-tts', env.DUET_TTS_VOICE || 'marin', env.OPENAI_API_KEY)
      }
    default:
      throw new Error(`Unknown voice provider "${provider}". Supported: openai.`)
  }
}
