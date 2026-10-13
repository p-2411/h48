import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkChat, checkLive, checkResponses, checkSpeech, checkTranscription } from '../src/rules.js';

const refused = (fn, code) => assert.throws(fn, error => error.status === 400 && error.code === code);

test('Responses: Duet\'s model passes, store is forced off and the user is named', () => {
  const body = { model: 'gpt-6-luna', input: 'hi', max_output_tokens: 1200, store: true };
  const checked = checkResponses(body, 'user-hash');
  assert.equal(checked.body.store, false);
  assert.equal(checked.body.safety_identifier, 'user-hash');
  assert.equal(checked.body.max_output_tokens, 1200);
  assert.equal(checked.model, 'gpt-6-luna');
});

test('Responses: the output limit is set when missing and clamped when too high', () => {
  assert.equal(checkResponses({ model: 'gpt-6-luna', input: 'x' }, 'u').body.max_output_tokens, 8000);
  assert.equal(checkResponses({ model: 'gpt-6-luna', input: 'x', max_output_tokens: 99_999 }, 'u').body.max_output_tokens, 8000);
});

test('Responses: another model, streaming, background, server tools and unknown fields are refused', () => {
  refused(() => checkResponses({ model: 'gpt-6-sol', input: 'x' }, 'u'), 'model');
  refused(() => checkResponses({ model: 'gpt-6-luna', input: 'x', stream: true }, 'u'), 'stream');
  refused(() => checkResponses({ model: 'gpt-6-luna', input: 'x', background: true }, 'u'), 'field');
  refused(() => checkResponses({ model: 'gpt-6-luna', input: 'x', tools: [{ type: 'web_search' }] }, 'u'), 'tools');
  refused(() => checkResponses({ model: 'gpt-6-luna', input: 'x', service_tier: 'priority' }, 'u'), 'field');
  refused(() => checkResponses({ model: 'gpt-6-luna', input: 'x', previous_response_id: 'r' }, 'u'), 'field');
});

test('Responses: the fields Duet sends today pass', () => {
  const body = {
    model: 'gpt-6-luna',
    store: false,
    instructions: 'x',
    input: [],
    tools: [{ type: 'function', name: 'f', parameters: {}, strict: true }],
    tool_choice: 'auto',
    text: { format: { type: 'json_schema' } },
    parallel_tool_calls: false,
    reasoning: { effort: 'low' },
    include: ['reasoning.encrypted_content'],
    max_output_tokens: 1200,
    prompt_cache_key: 'duet-lines'
  };
  assert.doesNotThrow(() => checkResponses(body, 'u'));
});

test('Chat: only the audio model, text out, one choice, a clamped limit', () => {
  const body = { model: 'gpt-audio-1.5', modalities: ['text'], messages: [], tools: [], tool_choice: 'auto' };
  const checked = checkChat(body, 'u');
  assert.equal(checked.body.max_completion_tokens, 1000);
  assert.equal(checked.body.safety_identifier, 'u');
  refused(() => checkChat({ ...body, model: 'gpt-6-luna' }, 'u'), 'model');
  refused(() => checkChat({ ...body, modalities: ['text', 'audio'] }, 'u'), 'modalities');
  refused(() => checkChat({ ...body, n: 3 }, 'u'), 'field');
  refused(() => checkChat({ ...body, stream: true }, 'u'), 'stream');
});

test('Transcription: only the mini model and files up to 4 MB', () => {
  const ok = { model: 'gpt-4o-mini-transcribe', fileBytes: 100_000, fields: ['file', 'model', 'language', 'prompt'] };
  assert.equal(checkTranscription(ok).model, 'gpt-4o-mini-transcribe');
  refused(() => checkTranscription({ ...ok, model: 'whisper-1' }), 'model');
  refused(() => checkTranscription({ ...ok, fileBytes: 5_000_000 }), 'size');
  refused(() => checkTranscription({ ...ok, fields: ['file', 'model', 'stream'] }), 'field');
});

test('Speech: only the mini voice model and up to 1,000 characters', () => {
  const body = { model: 'gpt-4o-mini-tts', voice: 'marin', input: 'hola', instructions: 'x', response_format: 'mp3' };
  assert.equal(checkSpeech(body).inputChars, 4);
  refused(() => checkSpeech({ ...body, model: 'tts-1-hd' }), 'model');
  refused(() => checkSpeech({ ...body, input: 'x'.repeat(1001) }), 'size');
});

test('Live: only gpt-live-1 over WebRTC, with a bounded SDP offer and backend model', () => {
  const body = {
    session: { model: 'gpt-live-1', delegation: { type: 'responses', responses: { model: 'gpt-6-luna', max_output_tokens: 1200 } } },
    transport: { type: 'webrtc', sdp: 'v=0' }
  };
  assert.doesNotThrow(() => checkLive(body));
  refused(() => checkLive({ ...body, session: { ...body.session, model: 'gpt-live-2' } }), 'model');
  refused(() => checkLive({ ...body, transport: { type: 'webrtc', sdp: 'x'.repeat(100_001) } }), 'size');
  refused(
    () => checkLive({ ...body, session: { model: 'gpt-live-1', delegation: { type: 'responses', responses: { model: 'gpt-6-sol' } } } }),
    'model'
  );
});
