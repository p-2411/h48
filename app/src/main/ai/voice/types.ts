// The contract for voice models: turning speech into text and text into speech. As with lines,
// nothing outside src/main/ai knows which provider is in use; a provider implements these
// interfaces in one file (see openai.ts) and index.ts picks it from settings.
//
// The tutor's conversation itself (what to say back) is not here (it is GPT-Live, src/main/tutor).
// Saying a line back (the daily session, checkpoints) uses TextToSpeech (Duet says it) and PronunciationCoach
// (how the learner said it).
import type { LineAttempt } from '../../../shared/daily'
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
  /** What was said. `language` is the one being practised; a learner may also speak English. For a
   * video's own speech, pass `options.only` to transcribe in that language alone, and `options.before`
   * (the text just before) for continuity. */
  transcribe(
    audio: AudioClip,
    language: Language,
    signal?: AbortSignal,
    options?: { only?: boolean; before?: string }
  ): Promise<{ text: string }>
}

/** How a line was said, as heard in the video's audio. */
export type Delivery = {
  /** A few sentences on the delivery: emotion, attitude, emphasis, pace. */
  description: string
  /** The language actually spoken, in English ("Spanish"). On a subtitled or dubbed video it differs
   * from the line's language, and the description then can't speak to the line's own words. */
  spokenLanguage: string
}

/** Listens to a line from a video and describes how it is said, for Explain's tone. */
export interface DeliveryListener {
  readonly name: string
  /** How the line is delivered, or undefined when the speech can't be made out. */
  describe(audio: AudioClip, line: { original: string; language: Language }, signal?: AbortSignal): Promise<Delivery | undefined>
}

/** Says text aloud, as Duet's voice: the line the learner is to say back (the daily session, checkpoints). */
export interface TextToSpeech {
  readonly name: string
  speak(text: string, language: Language, signal?: AbortSignal): Promise<AudioClip>
}

export type { LineAttempt } from '../../../shared/daily'

/** Hears the learner say a line back and says what matched, and at most one thing to work on. */
export interface PronunciationCoach {
  readonly name: string
  coach(audio: AudioClip, line: { original: string; translation?: string; language: Language }, signal?: AbortSignal): Promise<LineAttempt>
}
