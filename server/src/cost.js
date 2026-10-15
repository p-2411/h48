// What a call cost, in whole micro-dollars (µ$), from the usage in OpenAI's reply. Each cost is
// rounded up, so many small calls never add up to less than they cost.
import { MP3_BYTES_PER_SECOND, price, TTS_TOKENS_PER_MINUTE } from './prices.js';

const up = micro => Math.ceil(micro - 1e-9);
const count = value => (Number.isFinite(value) && value > 0 ? value : 0);

export function responsesCost(model, usage) {
  const p = price(model);
  const input = count(usage?.input_tokens);
  const cached = count(usage?.input_tokens_details?.cached_tokens);
  const written = count(usage?.input_tokens_details?.cache_write_tokens);
  const fresh = Math.max(0, input - cached - written);
  return up(fresh * p.input + cached * p.cached + written * p.cacheWrite + count(usage?.output_tokens) * p.output);
}

export function chatCost(model, usage) {
  const p = price(model);
  const audioIn = count(usage?.prompt_tokens_details?.audio_tokens);
  const textIn = Math.max(0, count(usage?.prompt_tokens) - audioIn);
  const audioOut = count(usage?.completion_tokens_details?.audio_tokens);
  const textOut = Math.max(0, count(usage?.completion_tokens) - audioOut);
  return up(textIn * p.input + audioIn * p.audioInput + textOut * p.output + audioOut * p.audioOutput);
}

/** By token usage when the reply has it, else by the audio's length (from the reply, or the estimate given). */
export function transcriptionCost(model, usage, estimatedSeconds) {
  const p = price(model);
  if (usage?.type === 'tokens')
    return up(count(usage.input_tokens) * p.input + count(usage.output_tokens) * p.output);
  const seconds = usage?.type === 'duration' ? count(usage.seconds) : count(estimatedSeconds);
  return up(seconds * (p.perMinute / 60) * 1e6);
}

/** Speech replies are audio with no usage: the text in (the input and the instructions) counts at
 * most a token per two characters, and the audio out is estimated from the MP3's size. */
export function speechCost(model, textChars, audioBytes) {
  const p = price(model);
  const textTokens = Math.ceil(count(textChars) / 2);
  const seconds = count(audioBytes) / MP3_BYTES_PER_SECOND;
  const audioTokens = Math.ceil((seconds * TTS_TOKENS_PER_MINUTE) / 60);
  return up(textTokens * p.input + audioTokens * p.audioOutput);
}

/** Live voice: per second at the per-minute price. */
export function liveCost(ms) {
  return up((count(ms) / 60_000) * price('gpt-live-1').perMinute * 1e6);
}
