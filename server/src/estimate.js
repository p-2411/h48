// How much to hold before a call: a generous guess of its cost, in µ$. The real cost is charged
// after; a hold only needs to be large enough that calls in flight cannot pass the cap together.
import { MP3_BYTES_PER_SECOND, price, TTS_TOKENS_PER_MINUTE } from './prices.js';

// No call holds less than this, so even tiny calls need a little room under the cap.
export const MIN_HOLD = 100;
// Text: at most one token per two bytes of JSON (Japanese is about three bytes a character).
const BYTES_PER_TOKEN = 2;
// Audio in: about 10 tokens a second; 800 bytes a second is lower than any audio Duet sends, so the
// length (and the hold) is never under the real one.
const AUDIO_BYTES_PER_TOKEN = 80;
// Compressed speech (Opus in WebM) is about 2,000 bytes a second or more.
const SPEECH_BYTES_PER_SECOND = 2000;

const up = micro => Math.max(MIN_HOLD, Math.ceil(micro));

export function estimateResponses(model, bodyBytes, maxOutput) {
  const p = price(model);
  // Cache writes are the dearest input, so all input is held at that price.
  return up((bodyBytes / BYTES_PER_TOKEN) * Math.max(p.input, p.cacheWrite ?? 0) + maxOutput * p.output);
}

/** `audioChars` is the length of the base64 audio in the messages; the rest of the body is text. */
export function estimateChat(model, bodyBytes, audioChars, maxOutput) {
  const p = price(model);
  const audioBytes = (audioChars * 3) / 4;
  const textBytes = Math.max(0, bodyBytes - audioChars);
  return up((textBytes / BYTES_PER_TOKEN) * p.input + (audioBytes / AUDIO_BYTES_PER_TOKEN) * p.audioInput + maxOutput * p.output);
}

/** The audio's length in seconds, guessed from its size. */
export const speechSeconds = fileBytes => fileBytes / SPEECH_BYTES_PER_SECOND;

export function estimateTranscription(model, fileBytes) {
  const p = price(model);
  const seconds = speechSeconds(fileBytes);
  // Held at four times the per-minute price, as the token usage can come to more than it.
  return up(seconds * (p.perMinute / 60) * 4 * 1e6);
}

/** The instructions are billed as text in, like the input, but are not spoken. */
export function estimateSpeech(model, inputChars, instructionChars = 0) {
  const p = price(model);
  // Slow, clear speech is about 5 characters a second; allow for 2.
  const seconds = inputChars / 2 + 5;
  return up(((inputChars + instructionChars) / 2) * p.input + ((seconds * TTS_TOKENS_PER_MINUTE) / 60) * p.audioOutput);
}

/** The speech reply's length in seconds, from its MP3 size. */
export const mp3Seconds = bytes => bytes / MP3_BYTES_PER_SECOND;
