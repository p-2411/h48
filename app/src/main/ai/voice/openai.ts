// Speech to text and text to speech backed by the OpenAI API. The only voice file that imports
// OpenAI's SDK.
import OpenAI, { toFile } from 'openai'
import { LANGUAGES, type Language } from '../../../shared/types'
import { ModelError, type AudioClip, type SpeechToText, type TextToSpeech } from './types'

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' }

function asModelError(error: unknown): unknown {
  if (error instanceof ModelError) return error
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
    return new ModelError('The OpenAI API key was rejected.', 'auth')
  if (error instanceof OpenAI.RateLimitError) return new ModelError('Rate limited by OpenAI.', 'rate_limit')
  if (error instanceof OpenAI.APIConnectionError) return new ModelError('Could not reach OpenAI.', 'network')
  return error
}

export class OpenAISpeechToText implements SpeechToText {
  readonly name: string
  private readonly client: OpenAI

  constructor(
    private readonly model: string,
    apiKey?: string
  ) {
    this.name = `openai/${model}`
    this.client = new OpenAI(apiKey ? { apiKey } : {})
  }

  async transcribe(audio: AudioClip, language: Language, signal?: AbortSignal): Promise<{ text: string }> {
    const type = audio.mimeType.split(';')[0]
    const file = await toFile(audio.data, `speech.${EXTENSIONS[type] ?? 'webm'}`, { type })
    try {
      // No language hint: learners mix English and the language they practise.
      const result = await this.client.audio.transcriptions.create(
        { file, model: this.model, prompt: `The speaker is an English speaker practising ${LANGUAGES[language]}.` },
        { signal }
      )
      return { text: result.text }
    } catch (error) {
      throw asModelError(error)
    }
  }
}

export class OpenAITextToSpeech implements TextToSpeech {
  readonly name: string
  private readonly client: OpenAI

  constructor(
    private readonly model: string,
    private readonly voice: string,
    apiKey?: string
  ) {
    this.name = `openai/${model}`
    this.client = new OpenAI(apiKey ? { apiKey } : {})
  }

  async speak(text: string, language: Language, signal?: AbortSignal): Promise<AudioClip> {
    try {
      const response = await this.client.audio.speech.create(
        {
          model: this.model,
          voice: this.voice,
          input: text,
          instructions: `Speak clearly and naturally, as a friendly ${LANGUAGES[language]} tutor.`,
          response_format: 'mp3'
        },
        { signal }
      )
      return { data: new Uint8Array(await response.arrayBuffer()), mimeType: 'audio/mpeg' }
    } catch (error) {
      throw asModelError(error)
    }
  }
}
