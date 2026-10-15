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
  // Forwarded as it came: a second model or file would go to OpenAI unchecked.
  refused(() => checkTranscription({ ...ok, fields: ['file', 'model', 'model'] }), 'field');
  refused(() => checkTranscription({ ...ok, fields: ['file', 'file', 'model'] }), 'field');
});

test('Speech: only the mini voice model and up to 1,000 characters', () => {
  const body = { model: 'gpt-4o-mini-tts', voice: 'marin', input: 'hola', instructions: 'x', response_format: 'mp3' };
  assert.equal(checkSpeech(body).inputChars, 4);
  refused(() => checkSpeech({ ...body, model: 'tts-1-hd' }), 'model');
  refused(() => checkSpeech({ ...body, input: 'x'.repeat(1001) }), 'size');
});

test('Live: only gpt-live-1 over WebRTC, with a bounded SDP offer and backend model', () => {
  const body = {
    session: {
      model: 'gpt-live-1',
      client: { data_channel: { allowed_client_events: ['response.create'] } },
      delegation: { type: 'responses', responses: { model: 'gpt-6-luna', max_output_tokens: 1200 } }
    },
    transport: { type: 'webrtc', sdp: 'v=0' }
  };
  assert.doesNotThrow(() => checkLive(body));
  refused(() => checkLive({ ...body, session: { ...body.session, model: 'gpt-live-2' } }), 'model');
  refused(() => checkLive({ ...body, transport: { type: 'webrtc', sdp: 'x'.repeat(100_001) } }), 'size');
  refused(
    () => checkLive({ ...body, session: { ...body.session, delegation: { type: 'responses', responses: { model: 'gpt-6-sol' } } } }),
    'model'
  );
});

test('Live: only known session and backend fields and function tools, and nothing stored', () => {
  const body = () => ({
    session: {
      model: 'gpt-live-1',
      store: true,
      instructions: 'x',
      client: { data_channel: { allowed_client_events: ['response.create'] } },
      delegation: { type: 'responses', responses: { model: 'gpt-6-luna', tools: [{ type: 'function', name: 'f' }] } }
    },
    transport: { type: 'webrtc', sdp: 'v=0' }
  });
  assert.equal(checkLive(body()).body.session.store, false);
  const withField = body();
  withField.session.tools = [{ type: 'mcp' }];
  refused(() => checkLive(withField), 'tools');
  const pricier = body();
  pricier.session.delegation.responses.service_tier = 'priority';
  refused(() => checkLive(pricier), 'field');
  const unknown = body();
  unknown.session.recording = true;
  refused(() => checkLive(unknown), 'field');
  refused(() => checkLive({ ...body(), extra: 1 }), 'field');
  const delegated = body();
  delegated.session.delegation.store = true;
  refused(() => checkLive(delegated), 'field');
});

test('Live: the data channel allows only the client events Duet sends', () => {
  const body = events => ({
    session: { model: 'gpt-live-1', client: { data_channel: { allowed_client_events: events, allowed_server_events: 'all' } } },
    transport: { type: 'webrtc', sdp: 'v=0' }
  });
  assert.doesNotThrow(() => checkLive(body(['response.create', 'session.close'])));
  refused(() => checkLive(body(['response.create', 'session.update'])), 'client');
  refused(() => checkLive(body('all')), 'client');
  // Left out, OpenAI allows every client event: refused too.
  const bare = { session: { model: 'gpt-live-1' }, transport: { type: 'webrtc', sdp: 'v=0' } };
  refused(() => checkLive(bare), 'client');
  refused(() => checkLive({ ...bare, session: { model: 'gpt-live-1', client: {} } }), 'client');
  refused(() => checkLive({ ...bare, session: { model: 'gpt-live-1', client: { data_channel: {} } } }), 'client');
});

test('a tools field that is not a list is refused, not a crash', () => {
  refused(() => checkResponses({ model: 'gpt-6-luna', input: 'x', tools: 'web' }, 'u'), 'tools');
});

test('Speech: only MP3, as the cost is estimated from its size', () => {
  const body = { model: 'gpt-4o-mini-tts', voice: 'marin', input: 'hola' };
  assert.doesNotThrow(() => checkSpeech({ ...body, response_format: 'mp3' }));
  refused(() => checkSpeech({ ...body, response_format: 'wav' }), 'response_format');
});
