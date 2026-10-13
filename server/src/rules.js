// What the proxy lets through, by route. Only the models and fields Duet sends are allowed, so a
// changed app cannot use the key for a dearer model, a stored conversation or a server-side tool.
// Each check gives back the body to forward (with the output limit clamped) and the model.
import { refuse } from './errors.js';

const RESPONSES_MODELS = new Set(['gpt-6-luna']);
const RESPONSES_FIELDS = new Set([
  'model', 'input', 'instructions', 'tools', 'tool_choice', 'text', 'reasoning', 'max_output_tokens',
  'prompt_cache_key', 'store', 'include', 'temperature', 'top_p', 'parallel_tool_calls', 'metadata',
  'truncation', 'stream', 'safety_identifier'
]);
const RESPONSES_MAX_OUTPUT = 8000;

const CHAT_MODELS = new Set(['gpt-audio-1.5']);
const CHAT_FIELDS = new Set([
  'model', 'messages', 'tools', 'tool_choice', 'modalities', 'max_completion_tokens', 'max_tokens',
  'temperature', 'top_p', 'parallel_tool_calls', 'stream', 'n', 'safety_identifier'
]);
const CHAT_MAX_OUTPUT = 1000;

const TRANSCRIPTION_MODELS = new Set(['gpt-4o-mini-transcribe']);
const TRANSCRIPTION_FIELDS = new Set(['file', 'model', 'language', 'prompt', 'response_format', 'temperature']);
// Vercel takes at most 4.5 MB in a request; Duet's speech pieces are 8 s or less.
const TRANSCRIPTION_MAX_BYTES = 4_000_000;

const SPEECH_MODELS = new Set(['gpt-4o-mini-tts']);
const SPEECH_FIELDS = new Set(['model', 'voice', 'input', 'instructions', 'response_format', 'speed']);
const SPEECH_MAX_CHARS = 1000;

const LIVE_MODELS = new Set(['gpt-live-1']);
const SDP_MAX_CHARS = 100_000;

function onlyKnownFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw refuse('body', 'The body must be a JSON object.');
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw refuse('field', `${key} is not allowed.`);
}

function knownModel(model, allowed) {
  if (!allowed.has(model)) throw refuse('model', `${model} is not allowed.`);
}

function noStream(body) {
  if (body.stream) throw refuse('stream', 'Streaming is not allowed.');
}

const clamp = (value, most) => (Number.isFinite(value) && value > 0 ? Math.min(value, most) : most);

export function checkResponses(body, userHash) {
  onlyKnownFields(body, RESPONSES_FIELDS);
  knownModel(body.model, RESPONSES_MODELS);
  noStream(body);
  for (const tool of body.tools ?? [])
    if (tool?.type !== 'function') throw refuse('tools', 'Only function tools are allowed.');
  const forward = {
    ...body,
    store: false,
    safety_identifier: userHash,
    max_output_tokens: clamp(body.max_output_tokens, RESPONSES_MAX_OUTPUT)
  };
  return { body: forward, model: body.model, maxOutput: forward.max_output_tokens };
}

export function checkChat(body, userHash) {
  onlyKnownFields(body, CHAT_FIELDS);
  knownModel(body.model, CHAT_MODELS);
  noStream(body);
  if (body.n !== undefined && body.n !== 1) throw refuse('field', 'n must be 1.');
  if (body.modalities && (body.modalities.length !== 1 || body.modalities[0] !== 'text'))
    throw refuse('modalities', 'Only text replies are allowed.');
  for (const tool of body.tools ?? [])
    if (tool?.type !== 'function') throw refuse('tools', 'Only function tools are allowed.');
  const { max_tokens, ...rest } = body;
  const forward = {
    ...rest,
    safety_identifier: userHash,
    max_completion_tokens: clamp(body.max_completion_tokens ?? max_tokens, CHAT_MAX_OUTPUT)
  };
  return { body: forward, model: body.model, maxOutput: forward.max_completion_tokens };
}

/** `fields` are the multipart field names; the file itself is forwarded as it came. */
export function checkTranscription({ model, fileBytes, fields }) {
  for (const field of fields) if (!TRANSCRIPTION_FIELDS.has(field)) throw refuse('field', `${field} is not allowed.`);
  knownModel(model, TRANSCRIPTION_MODELS);
  if (!(fileBytes > 0) || fileBytes > TRANSCRIPTION_MAX_BYTES) throw refuse('size', 'The audio must be 4 MB or less.');
  return { model };
}

export function checkSpeech(body) {
  onlyKnownFields(body, SPEECH_FIELDS);
  knownModel(body.model, SPEECH_MODELS);
  const input = typeof body.input === 'string' ? body.input : '';
  if (!input || input.length > SPEECH_MAX_CHARS) throw refuse('size', 'The text must be 1 to 1,000 characters.');
  if (typeof body.instructions === 'string' && body.instructions.length > SPEECH_MAX_CHARS)
    throw refuse('size', 'The instructions must be 1,000 characters or less.');
  return { body, model: body.model, inputChars: input.length };
}

export function checkLive(body) {
  if (!body?.session || !body?.transport) throw refuse('body', 'A session and a transport are needed.');
  knownModel(body.session.model, LIVE_MODELS);
  if (body.transport.type !== 'webrtc') throw refuse('transport', 'Only WebRTC is allowed.');
  const sdp = body.transport.sdp;
  if (typeof sdp !== 'string' || !sdp.trim() || sdp.length > SDP_MAX_CHARS) throw refuse('size', 'The SDP offer is not valid.');
  const delegation = body.session.delegation;
  if (delegation) {
    if (delegation.type !== 'responses') throw refuse('delegation', 'Only Responses delegation is allowed.');
    const backend = delegation.responses ?? {};
    knownModel(backend.model, RESPONSES_MODELS);
    backend.max_output_tokens = clamp(backend.max_output_tokens, RESPONSES_MAX_OUTPUT);
    for (const tool of backend.tools ?? [])
      if (tool?.type !== 'function') throw refuse('tools', 'Only function tools are allowed.');
  }
  return { body, model: body.session.model };
}
