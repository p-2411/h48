// OpenAI's prices for the models Duet uses, from https://developers.openai.com/api/docs/pricing.
// Dollars per million tokens, which is the same number as micro-dollars (µ$) per token.
export const PRICES_CHECKED = '2026-10-13';

export const PRICES = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 },
  'gpt-audio-1.5': { input: 2.5, output: 10, audioInput: 32, audioOutput: 64 },
  // Transcription: audio in at the input price, text out at the output price; about $0.003 a minute.
  'gpt-4o-mini-transcribe': { input: 1.25, output: 5, perMinute: 0.003 },
  'gpt-4o-mini-tts': { input: 0.6, audioOutput: 12 },
  // $0.05 a minute, billed per second. The backend model the voice hands its thinking to is billed
  // apart and the server never sees its usage, so a 10% allowance covers it.
  'gpt-live-1': { perMinute: 0.055 }
};

// OpenAI's own estimate for gpt-4o-mini-tts ($0.015 a minute at $12 per million) means 1,250 audio
// tokens a minute.
export const TTS_TOKENS_PER_MINUTE = 1250;
// The MP3 OpenAI's speech returns is about 48 kbit/s: 6,000 bytes a second. This only estimates the
// audio's length when the reply carries no usage.
export const MP3_BYTES_PER_SECOND = 6000;

export function price(model) {
  const found = PRICES[model];
  if (!found) throw new Error(`No price for ${model}`);
  return found;
}
