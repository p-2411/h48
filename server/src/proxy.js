// The pass-through routes: check the call against the rules, hold an estimate, forward it to OpenAI
// with the owner's key, then charge the real cost from the reply (or free the hold if OpenAI
// failed). The reply goes back as OpenAI sent it, so the app's SDK reads it as before.
import { chatCost, responsesCost, speechCost, transcriptionCost } from './cost.js';
import { HttpError } from './errors.js';
import {
  estimateChat,
  estimateResponses,
  estimateSpeech,
  estimateTranscription,
  speechSeconds
} from './estimate.js';
import { hold, release, settle } from './meter.js';
import { creditPeriod, limits } from './plans.js';
import { capReached, readJson } from './respond.js';
import { checkChat, checkResponses, checkSpeech, checkTranscription } from './rules.js';

export const OPENAI = 'https://api.openai.com';

/** Holds `amount` for the user, or throws the cap reply. Gives the charge id. */
export async function holdFor(ctx, { amount, route, model }) {
  const { db, user, now } = ctx;
  const period = creditPeriod(user, now);
  const chargeId = await hold(db, {
    userId: user.id,
    period: period.key,
    cap: limits(user).credits,
    amount,
    route,
    model,
    now
  });
  if (!chargeId) {
    // A Free account blocked by the device rule has a cap of 0: the app says why, not "used up".
    const blocked = user.plan !== 'paid' && Boolean(user.free_blocked);
    throw capReached('credits', period.resetsAt, blocked ? { blocked: true } : {});
  }
  return chargeId;
}

/** Calls OpenAI with the owner's key. A failure to reach it is a 502 for the app. */
export async function callOpenAI(ctx, path, init) {
  try {
    return await ctx.deps.fetchOpenAI(`${OPENAI}${path}`, {
      method: 'POST',
      ...init,
      headers: { authorization: `Bearer ${ctx.deps.openaiKey}`, ...init.headers }
    });
  } catch {
    throw new HttpError(502, 'upstream', 'Could not reach OpenAI.');
  }
}

/** The reply's body. A reply cut off while it is read is a 502, as nothing came back. */
export async function bodyOf(upstream) {
  try {
    return await upstream.arrayBuffer();
  } catch {
    throw new HttpError(502, 'upstream', 'The reply from OpenAI was cut off.');
  }
}

/** Passes OpenAI's reply on. Its refusal of the owner's key is the server's fault, not the user's
 * sign-in, so 401 and 403 become 502. */
function passOn(upstream, body) {
  if (upstream.status === 401 || upstream.status === 403)
    return new HttpError(502, 'upstream', 'OpenAI refused the server.');
  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' }
  });
}

/** Forwards a call already held: charges `cost(reply)` on success, frees the hold on failure. */
async function forward(ctx, chargeId, path, init, cost) {
  let upstream;
  let body;
  try {
    upstream = await callOpenAI(ctx, path, init);
    body = await bodyOf(upstream);
  } catch (error) {
    await release(ctx.db, chargeId, ctx.now);
    throw error;
  }
  if (!upstream.ok) {
    await release(ctx.db, chargeId, ctx.now);
    const passed = passOn(upstream, body);
    if (passed instanceof HttpError) throw passed;
    return passed;
  }
  let charged = { micro: null, usage: { unreadable: true } };
  try {
    charged = cost(body);
  } catch {
    // A reply whose usage cannot be read is charged at its hold.
  }
  await settle(ctx.db, chargeId, charged.micro, charged.usage, ctx.now);
  return passOn(upstream, body);
}

const jsonOf = body => JSON.parse(new TextDecoder().decode(body));

/** The usage in a reply; a reply without one is charged at its hold. */
function usageOf(body) {
  const usage = jsonOf(body).usage;
  if (!usage) throw new Error('No usage');
  return usage;
}

export async function responses(ctx, request) {
  const raw = await readJson(request);
  const checked = checkResponses(raw, ctx.userHash);
  const text = JSON.stringify(checked.body);
  const chargeId = await holdFor(ctx, {
    amount: estimateResponses(checked.model, Buffer.byteLength(text), checked.maxOutput),
    route: 'responses',
    model: checked.model
  });
  return forward(ctx, chargeId, '/v1/responses', { headers: { 'content-type': 'application/json' }, body: text }, body => {
    const usage = usageOf(body);
    return { micro: responsesCost(checked.model, usage), usage };
  });
}

/** The length of the base64 audio in chat messages. */
function audioChars(messages) {
  let total = 0;
  for (const message of messages ?? [])
    if (Array.isArray(message?.content))
      for (const part of message.content)
        if (part?.type === 'input_audio' && typeof part.input_audio?.data === 'string') total += part.input_audio.data.length;
  return total;
}

export async function chat(ctx, request) {
  const raw = await readJson(request);
  const checked = checkChat(raw, ctx.userHash);
  const text = JSON.stringify(checked.body);
  const chargeId = await holdFor(ctx, {
    amount: estimateChat(checked.model, Buffer.byteLength(text), audioChars(checked.body.messages), checked.maxOutput),
    route: 'chat',
    model: checked.model
  });
  return forward(ctx, chargeId, '/v1/chat/completions', { headers: { 'content-type': 'application/json' }, body: text }, body => {
    const usage = usageOf(body);
    return { micro: chatCost(checked.model, usage), usage };
  });
}

export async function transcription(ctx, request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'body', 'The body must be multipart form data.');
  }
  const file = form.get('file');
  const fileBytes = file && typeof file === 'object' ? file.size : 0;
  const { model } = checkTranscription({ model: form.get('model'), fileBytes, fields: [...form.keys()] });
  const chargeId = await holdFor(ctx, { amount: estimateTranscription(model, fileBytes), route: 'transcription', model });
  return forward(ctx, chargeId, '/v1/audio/transcriptions', { body: form }, body => {
    const usage = jsonOf(body).usage;
    return { micro: transcriptionCost(model, usage, speechSeconds(fileBytes)), usage };
  });
}

export async function speech(ctx, request) {
  const raw = await readJson(request);
  const checked = checkSpeech(raw);
  const chargeId = await holdFor(ctx, {
    amount: estimateSpeech(checked.model, checked.inputChars, checked.instructionChars),
    route: 'speech',
    model: checked.model
  });
  return forward(
    ctx,
    chargeId,
    '/v1/audio/speech',
    { headers: { 'content-type': 'application/json' }, body: JSON.stringify(checked.body) },
    body => ({
      micro: speechCost(checked.model, checked.inputChars + checked.instructionChars, body.byteLength),
      usage: {
        estimated: true,
        input_chars: checked.inputChars,
        instruction_chars: checked.instructionChars,
        audio_bytes: body.byteLength
      }
    })
  );
}
