// The contract for voice models: turning speech into text and text into speech. As with lines,
// nothing outside src/main/ai knows which provider is in use; a provider implements these
// interfaces in one file (see openai.ts) and index.ts picks it from settings.
//
// The tutor's conversation itself (what to say back) and pronunciation assessment are not here yet:
// add their interfaces in this file the same way when they are designed.
import type { Language } from '../../../shared/types'

export { ModelError } from '../errors'

/** Recorded or generated audio, whole. */
export type AudioClip = {
  data: Uint8Array
  /** For example "audio/webm" (what Chromium records) or "audio/mpeg". */
  mimeType: string
}

export interface SpeechToText {
  /** Provider and model, for logs, e.g. "openai/gpt-4o-transcribe". */
  readonly name: string
  /** What was said. `language` is the one being practised; a learner may also speak English. */
  transcribe(audio: AudioClip, language: Language, signal?: AbortSignal): Promise<{ text: string }>
}

export interface TextToSpeech {
  readonly name: string
  /** Generated speech. Generated audio is never a checked pronunciation reference: label it. */
  speak(text: string, language: Language, signal?: AbortSignal): Promise<AudioClip>
}
