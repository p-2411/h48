import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatCost, liveCost, responsesCost, speechCost, transcriptionCost } from '../src/cost.js';

// Prices are dollars per million tokens, which is micro-dollars (µ$) per token.

test('a Responses call is charged by uncached, cached, cache-write and output tokens', () => {
  const usage = {
    input_tokens: 10_000,
    input_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 2_000 },
    output_tokens: 1_000,
    output_tokens_details: { reasoning_tokens: 200 }
  };
  // 2,000 × 0.10 + 6,000 × 0.01 + 2,000 × 0.125 + 1,000 × 0.50 = 200 + 60 + 250 + 500
  assert.equal(responsesCost('gpt-6-luna', usage), 1010);
});

test('a Responses call with no usage details is charged all input as uncached', () => {
  assert.equal(responsesCost('gpt-6-luna', { input_tokens: 1000, output_tokens: 0 }), 100);
});

test('a cost is rounded up to the next whole µ$', () => {
  assert.equal(responsesCost('gpt-6-luna', { input_tokens: 1, output_tokens: 0 }), 1);
});

test('a chat call with audio input is charged audio and text tokens apart', () => {
  const usage = {
    prompt_tokens: 1_100,
    prompt_tokens_details: { audio_tokens: 100 },
    completion_tokens: 50,
    completion_tokens_details: { audio_tokens: 0 }
  };
  // 1,000 × 2.50 + 100 × 32 + 50 × 10
  assert.equal(chatCost('gpt-audio-1.5', usage), 2500 + 3200 + 500);
});

test('a transcription is charged by its token usage, or else by its length', () => {
  assert.equal(
    transcriptionCost('gpt-4o-mini-transcribe', { type: 'tokens', input_tokens: 1000, output_tokens: 100 }, 0),
    1250 + 500
  );
  // $0.003 a minute: 30 s is 1,500 µ$.
  assert.equal(transcriptionCost('gpt-4o-mini-transcribe', { type: 'duration', seconds: 30 }, 0), 1500);
  assert.equal(transcriptionCost('gpt-4o-mini-transcribe', undefined, 60), 3000);
});

test('speech is charged for the text in and an estimate of the audio out', () => {
  // 100 characters: at most 50 tokens × 0.60 = 30. 60,000 bytes of MP3 is about 10 s; OpenAI's own
  // $0.015 a minute at $12 per million is 1,250 tokens a minute, so 10 s is ~209 tokens × 12.
  const cost = speechCost('gpt-4o-mini-tts', 100, 60_000);
  assert.equal(cost, 30 + Math.ceil((10 * 1250) / 60) * 12);
});

test('live voice is charged per second at $0.05 a minute plus the backend allowance', () => {
  assert.equal(liveCost(60_000), 55_000);
  assert.equal(liveCost(1_000), Math.ceil(55_000 / 60));
});

test('an unknown model has no price', () => {
  assert.throws(() => responsesCost('gpt-9', { input_tokens: 1, output_tokens: 1 }), /No price/);
});
