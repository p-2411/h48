// Picks the voice models from settings. To add a provider, write one file implementing the
// interfaces in types.ts and add a case here; nothing else in the app changes.
//
// Settings, from the environment (in development, app/.env.local):
//   DUET_VOICE_PROVIDER  openai (the only one so far, and the default)
//   DUET_STT_MODEL       speech to text, for hearing videos; default gpt-4o-mini-transcribe (half
//                        the cost of gpt-4o-transcribe per minute, close in accuracy)
//   DUET_LISTEN_MODEL    hears how a video's line is said, for Explain; default gpt-audio-1.5
//   DUET_TTS_MODEL       says a line to say back (daily session, checkpoints); default gpt-4o-mini-tts
//   DUET_COACH_MODEL     hears the learner say a line back; default gpt-audio-1.5
//   DUET_LIVE_VOICE      Duet's voice (the tutor's too); default marin
//   OPENAI_API_KEY      a development key; without one, Duet's server with the learner's sign-in
import { openAIAccess } from '../access'
import { OpenAIDeliveryListener, OpenAIPronunciationCoach, OpenAISpeechToText, OpenAITextToSpeech } from './openai'
import type { DeliveryListener, PronunciationCoach, SpeechToText, TextToSpeech } from './types'

export * from './types'

export type VoiceModels = {
  speechToText: SpeechToText
  listener: DeliveryListener
  tts: TextToSpeech
  coach: PronunciationCoach
}

export function createVoiceModels(env: NodeJS.ProcessEnv = process.env): VoiceModels {
  const provider = env.DUET_VOICE_PROVIDER?.toLowerCase() ?? 'openai'
  switch (provider) {
    case 'openai': {
      const access = openAIAccess(env)
      if (!access) throw new Error('Sign in to Duet to hear videos.')
      return {
        speechToText: new OpenAISpeechToText(env.DUET_STT_MODEL || 'gpt-4o-mini-transcribe', access),
        listener: new OpenAIDeliveryListener(env.DUET_LISTEN_MODEL || 'gpt-audio-1.5', access),
        tts: new OpenAITextToSpeech(env.DUET_TTS_MODEL || 'gpt-4o-mini-tts', env.DUET_LIVE_VOICE || 'marin', access),
        coach: new OpenAIPronunciationCoach(env.DUET_COACH_MODEL || 'gpt-audio-1.5', access)
      }
    }
    default:
      throw new Error(`Unknown voice provider "${provider}". Supported: openai.`)
  }
}
