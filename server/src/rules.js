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
const LIVE_FIELDS = new Set(['session', 'transport']);
const LIVE_SESSION_FIELDS = new Set(['model', 'store', 'audio', 'instructions', 'input', 'client', 'delegation', 'tools', 'tool_choice']);
const LIVE_DELEGATION_FIELDS = new Set(['type', 'responses']);
const LIVE_BACKEND_FIELDS = new Set([
  'model', 'instructions', 'max_output_tokens', 'parallel_tool_calls', 'reasoning', 'tool_choice', 'tools'
]);
// The events the app may send on the call's data channel (tutor/live.ts). Anything that changes the
// session (session.update) would undo the checks here after the call started.
const LIVE_CLIENT_EVENTS = new Set([
  'session.input_audio.mute',
  'session.input_audio.unmute',
  'session.instructions.append',
  'session.commentary.append',
  'response.item.create',
  'response.create',
  'session.close'
]);
const LIVE_CLIENT_FIELDS = new Set(['data_channel']);
const LIVE_CHANNEL_FIELDS = new Set(['allowed_client_events', 'allowed_server_events']);
const SDP_MAX_CHARS = 100_000;

function onlyKnownFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw refuse('body', 'The body must be a JSON object.');
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw refuse('field', `${key} is not allowed.`);
}

function knownModel(model, allowed) {
  if (!allowed.has(model)) throw refuse('model', `${model} is not allowed.`);
}

function onlyFunctionTools(tools) {
  if (tools === undefined) return;
  if (!Array.isArray(tools)) throw refuse('tools', 'The tools must be a list.');
  for (const tool of tools) if (tool?.type !== 'function') throw refuse('tools', 'Only function tools are allowed.');
}

function noStream(body) {
  if (body.stream) throw refuse('stream', 'Streaming is not allowed.');
}

const clamp = (value, most) => (Number.isFinite(value) && value > 0 ? Math.min(value, most) : most);

export function checkResponses(body, userHash) {
  onlyKnownFields(body, RESPONSES_FIELDS);
  knownModel(body.model, RESPONSES_MODELS);
  noStream(body);
  onlyFunctionTools(body.tools);
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
  onlyFunctionTools(body.tools);
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
  // The cost is estimated from the MP3's size, so only MP3 is allowed.
  if (body.response_format !== undefined && body.response_format !== 'mp3')
    throw refuse('response_format', 'Only MP3 is allowed.');
  if (typeof body.instructions === 'string' && body.instructions.length > SPEECH_MAX_CHARS)
    throw refuse('size', 'The instructions must be 1,000 characters or less.');
  return { body, model: body.model, inputChars: input.length };
}

/** The data channel's settings: only the client events Duet sends. They must be named: left out,
 * OpenAI allows every client event (session.update among them). */
function checkLiveClient(client) {
  const refused = () => refuse('client', 'Only the client events Duet sends are allowed.');
  if (client?.data_channel === undefined) throw refused();
  onlyKnownFields(client, LIVE_CLIENT_FIELDS);
  const channel = client.data_channel;
  onlyKnownFields(channel, LIVE_CHANNEL_FIELDS);
  const events = channel.allowed_client_events;
  if (!Array.isArray(events) || events.some(event => !LIVE_CLIENT_EVENTS.has(event))) throw refused();
}

export function checkLive(body) {
  if (!body?.session || !body?.transport) throw refuse('body', 'A session and a transport are needed.');
  onlyKnownFields(body, LIVE_FIELDS);
  knownModel(body.session.model, LIVE_MODELS);
  if (body.transport.type !== 'webrtc') throw refuse('transport', 'Only WebRTC is allowed.');
  const sdp = body.transport.sdp;
  if (typeof sdp !== 'string' || !sdp.trim() || sdp.length > SDP_MAX_CHARS) throw refuse('size', 'The SDP offer is not valid.');
  onlyKnownFields(body.session, LIVE_SESSION_FIELDS);
  onlyFunctionTools(body.session.tools);
  checkLiveClient(body.session.client);
  const delegation = body.session.delegation;
  if (delegation) {
    onlyKnownFields(delegation, LIVE_DELEGATION_FIELDS);
    if (delegation.type !== 'responses') throw refuse('delegation', 'Only Responses delegation is allowed.');
    const backend = delegation.responses ?? {};
    onlyKnownFields(backend, LIVE_BACKEND_FIELDS);
    knownModel(backend.model, RESPONSES_MODELS);
    backend.max_output_tokens = clamp(backend.max_output_tokens, RESPONSES_MAX_OUTPUT);
    onlyFunctionTools(backend.tools);
  }
  // Like the Responses route: nothing is kept at OpenAI.
  body.session.store = false;
  return { body, model: body.session.model };
}
