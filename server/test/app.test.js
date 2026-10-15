import assert from 'node:assert/strict';
import { test } from 'node:test';
import Stripe from 'stripe';
import { createApp } from '../src/app.js';
import { meter } from '../src/meter.js';
import { MICRO_PER_CREDIT } from '../src/plans.js';
import { at, freshDb, keys } from './helpers.js';

const DEVICE = 'd'.repeat(64);
const KEY = 'sk-test-owner-key';
const START = at('2026-10-13T10:00:00Z');

const luna = (output = 100) => ({
  id: 'resp_1',
  output: [],
  usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: output }
});

/** A test server: a fresh database, a clock that can be moved, and a fake OpenAI that records calls. */
async function setup({ openai, stripe, fetchEmail } = {}) {
  const db = await freshDb();
  const { keySet, sign } = await keys();
  let now = START;
  const calls = [];
  const replies = openai ?? (() => Response.json(luna()));
  const fetchOpenAI = async (url, init) => {
    calls.push({ url: String(url), init });
    return replies(String(url), init);
  };
  const stripeLib = new Stripe('sk_test_fake');
  const app = createApp({
    db,
    keySet,
    openaiKey: KEY,
    fetchOpenAI,
    now: () => now,
    cronSecret: 'cron-secret',
    stripe: stripe ?? null,
    stripeLib,
    stripePrice: 'price_1',
    stripeWebhookSecret: 'whsec_test',
    random: (() => { let n = 0; return () => `id${++n}`; })(),
    fetchEmail: fetchEmail ?? null
  });
  const token = await sign('user_1');
  const send = (path, { method = 'POST', body, headers = {}, auth = token, device = DEVICE, raw } = {}) =>
    app(
      new Request(`https://api.useduet.io${path}`, {
        method,
        headers: {
          ...(auth ? { authorization: `Bearer ${auth}` } : {}),
          ...(device ? { 'x-duet-device': device } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers
        },
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined)
      })
    );
  return { db, app, send, calls, sign, move: ms => (now = new Date(now.getTime() + ms)), stripeLib };
}

const lunaBody = (extra = {}) => ({ model: 'gpt-6-luna', input: 'hola', max_output_tokens: 1000, ...extra });
const credits = async (db, period = 'm2026-10') => meter(db, 'user_1', 'credits', period);

test('a call without a valid token is refused with 401', async () => {
  const { send, calls } = await setup();
  const response = await send('/v1/responses', { body: lunaBody(), auth: null });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'auth');
  assert.equal(calls.length, 0);
});

test('a new user\'s email is looked up once at WorkOS when the server can', async () => {
  const asked = [];
  const { send, db } = await setup({ fetchEmail: async id => (asked.push(id), 'learner@example.com') });
  await send('/v1/duet/me', { method: 'GET' });
  await send('/v1/duet/me', { method: 'GET' });
  const [user] = await db.query(`select email from users where id = 'user_1'`);
  assert.equal(user.email, 'learner@example.com');
  assert.deepEqual(asked, ['user_1']);
});

test('a signed-in request on a known device costs few database round trips', async () => {
  const { send, db } = await setup();
  await send('/v1/duet/me', { method: 'GET' });
  const query = db.query;
  let count = 0;
  db.query = (...args) => (count++, query(...args));
  await send('/v1/duet/me', { method: 'GET' });
  db.query = query;
  // The user, the device, the two sweeps, then /me's two meters.
  assert.ok(count <= 6, `${count} queries`);
});

test('a call without a device id is refused', async () => {
  const { send } = await setup();
  const response = await send('/v1/responses', { body: lunaBody(), device: null });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'device');
});

test('a Responses call is forwarded with the owner\'s key and charged its real cost', async () => {
  const { send, calls, db } = await setup();
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 'resp_1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${KEY}`);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.store, false);
  assert.match(sent.safety_identifier, /^[0-9a-f]{32}$/);
  // 1,000 × 0.10 + 100 × 0.50
  assert.deepEqual(await credits(db), { used: 150, held: 0 });
});

test('the reply never carries the owner\'s key', async () => {
  const { send } = await setup();
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  const text = await response.text();
  assert.ok(!text.includes(KEY));
  for (const [, value] of response.headers) assert.ok(!value.includes(KEY));
});

test('at the credits cap the call is refused with 402 and never reaches OpenAI', async () => {
  const { send, calls, db } = await setup();
  await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  await db.query(`update meters set used = $1 where user_id = 'user_1'`, [200 * MICRO_PER_CREDIT - 100]);
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 402);
  const { error } = await response.json();
  assert.equal(error.code, 'usage_cap');
  assert.equal(error.cap, 'credits');
  assert.equal(error.resets_at, '2026-11-01T00:00:00.000Z');
  assert.equal(calls.length, 1);
});

test('a refusal tells the OpenAI SDK not to try again', async () => {
  const { send } = await setup();
  const response = await send('/v1/responses', { body: lunaBody() });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('x-should-retry'), 'false');
});

test('a Free account blocked on its device is told why at once', async () => {
  const { send, db, calls } = await setup();
  await send('/v1/duet/me', { method: 'GET' });
  await db.query(`update users set free_blocked = true`);
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 402);
  const { error } = await response.json();
  assert.equal(error.cap, 'credits');
  assert.equal(error.blocked, true);
  assert.equal(calls.length, 0);
});

test('a call refused by the rules costs nothing', async () => {
  const { send, calls, db } = await setup();
  const response = await send('/v1/responses', { body: lunaBody({ model: 'gpt-6-sol' }), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
  assert.deepEqual(await credits(db), { used: 0, held: 0 });
});

test('when OpenAI fails, the hold is freed and its error is passed on', async () => {
  const { send, db } = await setup({ openai: () => Response.json({ error: { message: 'busy' } }, { status: 429 }) });
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 429);
  assert.deepEqual(await credits(db), { used: 0, held: 0 });
});

test('OpenAI refusing the owner\'s key is not the user\'s sign-in failing', async () => {
  const { send } = await setup({ openai: () => Response.json({ error: { message: 'bad key' } }, { status: 401 }) });
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'upstream');
});

test('OpenAI out of reach frees the hold and answers 502', async () => {
  const { send, db } = await setup({ openai: () => { throw new TypeError('fetch failed'); } });
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 502);
  assert.deepEqual(await credits(db), { used: 0, held: 0 });
});

test('a chat call with audio is charged from its usage', async () => {
  const { send, db, calls } = await setup({
    openai: () => Response.json({ choices: [], usage: { prompt_tokens: 1100, prompt_tokens_details: { audio_tokens: 100 }, completion_tokens: 50 } })
  });
  const body = {
    model: 'gpt-audio-1.5',
    modalities: ['text'],
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'AAAA', format: 'wav' } }] }]
  };
  const response = await send('/v1/chat/completions', { body });
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.deepEqual(await credits(db), { used: 2500 + 3200 + 500, held: 0 });
});

test('a transcription is forwarded as multipart and charged from its usage', async () => {
  const { send, db, calls } = await setup({
    openai: () => Response.json({ text: 'hola', usage: { type: 'tokens', input_tokens: 1000, output_tokens: 100 } })
  });
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(32_000)], { type: 'audio/webm' }), 'speech.webm');
  form.set('model', 'gpt-4o-mini-transcribe');
  form.set('language', 'es');
  const response = await send('/v1/audio/transcriptions', { raw: form, headers: { 'x-duet-feature': 'talk' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'hola');
  const sent = calls[0].init.body;
  assert.ok(sent instanceof FormData);
  assert.equal(sent.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal((await sent.get('file').arrayBuffer()).byteLength, 32_000);
  assert.deepEqual(await credits(db), { used: 1250 + 500, held: 0 });
});

test('speech comes back as audio and is charged by estimate', async () => {
  const { send, db } = await setup({
    openai: () => new Response(new Uint8Array(60_000), { headers: { 'content-type': 'audio/mpeg' } })
  });
  const response = await send('/v1/audio/speech', {
    body: { model: 'gpt-4o-mini-tts', voice: 'marin', input: 'x'.repeat(100), response_format: 'mp3' }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await response.arrayBuffer()).byteLength, 60_000);
  assert.deepEqual(await credits(db), { used: 30 + 209 * 12, held: 0 });
});

test('an unknown route is 404', async () => {
  const { send } = await setup();
  assert.equal((await send('/v1/images/generations', { body: {} })).status, 404);
});

// Live voice

const liveBody = {
  session: { model: 'gpt-live-1', client: { data_channel: { allowed_client_events: ['response.create'] } } },
  transport: { type: 'webrtc', sdp: 'v=0 offer' }
};
const liveOpenAI = (url) =>
  url.endsWith('/hangup')
    ? new Response(null, { status: 204 })
    : Response.json({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0 answer' } });

test('a live call is started through the server and charged by the server\'s clock', async () => {
  const { send, db, move } = await setup({ openai: liveOpenAI });
  const started = await send('/v1/live/sessions', { body: liveBody });
  assert.equal(started.status, 200);
  assert.equal((await started.json()).session.id, 'live_1');
  move(30_000);
  const minute = await send('/v1/duet/live/live_1/minute', { body: { seconds: 999 } });
  assert.deepEqual(await minute.json(), { stop: false });
  move(60_000);
  const end = await send('/v1/duet/live/live_1/end', { body: { seconds: 1 } });
  assert.equal(end.status, 200);
  // 90 s at $0.055 a minute, whatever the app reported.
  assert.deepEqual(await credits(db), { used: 82_500, held: 0 });
});

test('a live call that reaches the cap is hung up and told to stop', async () => {
  const { send, db, move, calls } = await setup({ openai: liveOpenAI });
  await send('/v1/live/sessions', { body: liveBody });
  // Leave room for the first hold only.
  await db.query(`update meters set used = $1 where user_id = 'user_1'`, [200 * MICRO_PER_CREDIT - 120_000]);
  move(60_000);
  const minute = await send('/v1/duet/live/live_1/minute', { body: {} });
  const reply = await minute.json();
  assert.equal(reply.stop, true);
  assert.equal(reply.cap, 'credits');
  assert.ok(calls.some(c => c.url === 'https://api.openai.com/v1/live/sessions/live_1/hangup'));
  const { used, held } = await credits(db);
  assert.equal(held, 0);
  assert.equal(used, 200 * MICRO_PER_CREDIT - 120_000 + 55_000);
});

test('a live call whose app stops reporting is hung up and charged to its last minute plus one', async () => {
  const { send, db, move, calls } = await setup({ openai: liveOpenAI });
  await send('/v1/live/sessions', { body: liveBody });
  move(60_000);
  await send('/v1/duet/live/live_1/minute', { body: {} });
  // Silence from the app for five minutes; any request runs the sweep.
  move(5 * 60_000);
  await send('/v1/duet/me', { method: 'GET' });
  assert.ok(calls.some(c => c.url.endsWith('/live/sessions/live_1/hangup')));
  assert.deepEqual(await credits(db), { used: 110_000, held: 0 });
});

test('a live reply OpenAI sends that cannot be read frees the hold', async () => {
  const { send, db } = await setup({ openai: () => new Response('not json', { status: 200 }) });
  const response = await send('/v1/live/sessions', { body: liveBody });
  assert.equal(response.status, 502);
  assert.deepEqual(await credits(db), { used: 0, held: 0 });
});

test('a minute call for a call already ended is 404, never the cap', async () => {
  const { send } = await setup({ openai: liveOpenAI });
  await send('/v1/live/sessions', { body: liveBody });
  await send('/v1/duet/live/live_1/end', { body: {} });
  const minute = await send('/v1/duet/live/live_1/minute', { body: {} });
  assert.equal(minute.status, 404);
});

test('a malformed escape in a route is 404, not a server error', async () => {
  const { send } = await setup();
  assert.equal((await send('/v1/duet/live/%E0/minute', { body: {} })).status, 404);
});

test('a second live call ends the first', async () => {
  let n = 0;
  const { send, db } = await setup({
    openai: url =>
      url.endsWith('/hangup')
        ? new Response(null, { status: 204 })
        : Response.json({ session: { id: `live_${++n}` }, transport: { type: 'webrtc', sdp: 'a' } })
  });
  await send('/v1/live/sessions', { body: liveBody });
  await send('/v1/live/sessions', { body: liveBody });
  const open = await db.query(`select id from live_sessions where ended_at is null`);
  assert.deepEqual(open.map(row => row.id), ['live_2']);
});

test('a live call of another user cannot be reported on', async () => {
  const { send, sign } = await setup({ openai: liveOpenAI });
  await send('/v1/live/sessions', { body: liveBody });
  const response = await send('/v1/duet/live/live_1/minute', { body: {}, auth: await sign('user_2') });
  assert.equal(response.status, 404);
});

test('the cron sweep needs its secret', async () => {
  const { app } = await setup();
  const denied = await app(new Request('https://api.useduet.io/v1/duet/cron/sweep'));
  assert.equal(denied.status, 401);
  const ok = await app(new Request('https://api.useduet.io/v1/duet/cron/sweep', { headers: { authorization: 'Bearer cron-secret' } }));
  assert.equal(ok.status, 200);
});

// Watch hours (piece B)

test('lines need an open watch session', async () => {
  const { send, calls } = await setup();
  const refused = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'lines' } });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error.code, 'watch_required');
  const { id } = await (await send('/v1/duet/watch/start', { body: {} })).json();
  const ok = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'lines', 'x-duet-watch': id } });
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
});

test('a Responses call with no feature named is counted as lines', async () => {
  const { send } = await setup();
  const refused = await send('/v1/responses', { body: lunaBody() });
  assert.equal(refused.status, 409);
});

test('watch time is counted by the server clock, at most 45 s a beat', async () => {
  const { send, db, move } = await setup();
  const { id } = await (await send('/v1/duet/watch/start', { body: {} })).json();
  move(30_000);
  await send(`/v1/duet/watch/${id}/beat`, { body: { ms: 999_999 } });
  move(10 * 60_000);
  await send(`/v1/duet/watch/${id}/beat`, { body: {} });
  assert.equal((await meter(db, 'user_1', 'hours', 'w2026-10-12')).used, 75_000);
});

test('a watch session with no beat for a minute no longer lets lines through', async () => {
  const { send, move } = await setup();
  const { id } = await (await send('/v1/duet/watch/start', { body: {} })).json();
  move(61_000);
  const refused = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'lines', 'x-duet-watch': id } });
  assert.equal(refused.status, 409);
});

test('at the hours cap, beats and lines get 402 hours', async () => {
  const { send, db, move } = await setup();
  const { id } = await (await send('/v1/duet/watch/start', { body: {} })).json();
  await db.query(`update meters set used = $1 where kind = 'hours'`, [2 * 3600_000 - 10_000]);
  move(30_000);
  const beat = await send(`/v1/duet/watch/${id}/beat`, { body: {} });
  assert.equal(beat.status, 402);
  const { error } = await beat.json();
  assert.equal(error.cap, 'hours');
  assert.equal(error.resets_at, '2026-10-19T00:00:00.000Z');
  const start = await send('/v1/duet/watch/start', { body: {} });
  assert.equal(start.status, 402);
  const lines = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'lines', 'x-duet-watch': id } });
  assert.equal(lines.status, 402);
});

// What the app shows (piece C)

test('/me gives the plan, both meters and when they reset', async () => {
  const { send } = await setup();
  await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  const me = await (await send('/v1/duet/me', { method: 'GET' })).json();
  assert.deepEqual(me, {
    plan: 'free',
    freeBlocked: false,
    credits: { used: 0.015, cap: 200, resetsAt: '2026-11-01T00:00:00.000Z' },
    hours: { usedMs: 0, capMs: 2 * 3600_000, resetsAt: '2026-10-19T00:00:00.000Z' },
    billing: false
  });
});

// Payments (piece D)

function fakeStripe() {
  const made = [];
  return {
    made,
    checkout: { sessions: { create: async params => (made.push(['checkout', params]), { url: 'https://checkout.stripe.com/c/1' }) } },
    billingPortal: { sessions: { create: async params => (made.push(['portal', params]), { url: 'https://billing.stripe.com/p/1' }) } },
    subscriptions: { retrieve: async id => subscription(id, 'active') }
  };
}

const subscription = (id, status, user = 'user_1') => ({
  id,
  object: 'subscription',
  status,
  customer: 'cus_1',
  metadata: { duet_user: user },
  items: { data: [{ current_period_start: 1_760_000_000, current_period_end: 1_762_678_400 }] }
});

test('checkout gives a Stripe URL for the user', async () => {
  const stripe = fakeStripe();
  const { send } = await setup({ stripe });
  const reply = await (await send('/v1/duet/billing/checkout', { body: {} })).json();
  assert.equal(reply.url, 'https://checkout.stripe.com/c/1');
  const [, params] = stripe.made[0];
  assert.equal(params.mode, 'subscription');
  assert.equal(params.client_reference_id, 'user_1');
  assert.deepEqual(params.line_items, [{ price: 'price_1', quantity: 1 }]);
  assert.equal(params.subscription_data.metadata.duet_user, 'user_1');
});

test('without Stripe set up, billing says so', async () => {
  const { send } = await setup();
  const response = await send('/v1/duet/billing/checkout', { body: {} });
  assert.equal(response.status, 503);
});

async function webhook(app, stripeLib, event) {
  const payload = JSON.stringify(event);
  const signature = stripeLib.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
  return app(
    new Request('https://api.useduet.io/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      body: payload
    })
  );
}

test('a paid subscription makes the user Paid with its billing period; a cancelled one makes them Free', async () => {
  const stripe = fakeStripe();
  const { app, send, stripeLib, db } = await setup({ stripe });
  await send('/v1/duet/me', { method: 'GET' });
  const done = await webhook(app, stripeLib, {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'user_1', customer: 'cus_1', subscription: 'sub_1' } }
  });
  assert.equal(done.status, 200);
  let [user] = await db.query(`select * from users where id = 'user_1'`);
  assert.equal(user.plan, 'paid');
  assert.equal(user.stripe_customer, 'cus_1');
  assert.equal(new Date(user.period_start).getTime(), 1_760_000_000_000);
  await webhook(app, stripeLib, { id: 'evt_2', type: 'customer.subscription.deleted', data: { object: subscription('sub_1', 'canceled') } });
  [user] = await db.query(`select * from users where id = 'user_1'`);
  assert.equal(user.plan, 'free');
});

test('a late "created, incomplete" event does not undo a payment already applied', async () => {
  const stripe = fakeStripe();
  const { app, send, stripeLib, db } = await setup({ stripe });
  await send('/v1/duet/me', { method: 'GET' });
  await webhook(app, stripeLib, {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'user_1', customer: 'cus_1', subscription: 'sub_1' } }
  });
  // The event's own copy says incomplete; Stripe's current copy (fakeStripe) says active.
  await webhook(app, stripeLib, { id: 'evt_0', type: 'customer.subscription.created', data: { object: subscription('sub_1', 'incomplete') } });
  const [user] = await db.query(`select plan from users where id = 'user_1'`);
  assert.equal(user.plan, 'paid');
});

test('the end of an old subscription does not undo a newer one', async () => {
  const stripe = fakeStripe();
  const { app, send, stripeLib, db } = await setup({ stripe });
  await send('/v1/duet/me', { method: 'GET' });
  await webhook(app, stripeLib, {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'user_1', customer: 'cus_1', subscription: 'sub_2' } }
  });
  await webhook(app, stripeLib, { id: 'evt_2', type: 'customer.subscription.deleted', data: { object: subscription('sub_old', 'canceled') } });
  const [user] = await db.query(`select plan, stripe_subscription from users where id = 'user_1'`);
  assert.equal(user.plan, 'paid');
  assert.equal(user.stripe_subscription, 'sub_2');
});

test('a webhook with a wrong signature is refused', async () => {
  const { app } = await setup({ stripe: fakeStripe() });
  const response = await app(
    new Request('https://api.useduet.io/v1/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}' })
  );
  assert.equal(response.status, 400);
});

test('the portal is for users with a Stripe customer', async () => {
  const stripe = fakeStripe();
  const { send, db } = await setup({ stripe });
  assert.equal((await send('/v1/duet/billing/portal', { body: {} })).status, 409);
  await db.query(`update users set stripe_customer = 'cus_1' where id = 'user_1'`);
  const reply = await (await send('/v1/duet/billing/portal', { body: {} })).json();
  assert.equal(reply.url, 'https://billing.stripe.com/p/1');
});

// Review fixes

const brokenReply = () =>
  new Response(new ReadableStream({ start: controller => controller.error(new Error('reset')) }), { status: 200 });

test('a reply cut off while it is read frees the hold and is a 502', async () => {
  const { send, db } = await setup({ openai: brokenReply });
  const response = await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.equal(response.status, 502);
  assert.deepEqual(await credits(db), { used: 0, held: 0 });
});

test('a live reply cut off while it is read frees the hold', async () => {
  const { send, db } = await setup({ openai: brokenReply });
  const response = await send('/v1/live/sessions', { body: liveBody });
  assert.equal(response.status, 502);
  assert.deepEqual(await credits(db), { used: 0, held: 0 });
});

test('speech instructions are charged as text in', async () => {
  const { send, db } = await setup({
    openai: () => new Response(new Uint8Array(60_000), { headers: { 'content-type': 'audio/mpeg' } })
  });
  await send('/v1/audio/speech', {
    body: { model: 'gpt-4o-mini-tts', voice: 'marin', input: 'x'.repeat(100), instructions: 'y'.repeat(200) }
  });
  // 300 characters of text: at most 150 tokens × 0.60 = 90, then the audio as before.
  assert.deepEqual(await credits(db), { used: 90 + 209 * 12, held: 0 });
});

test('the email is looked up from /me, never on a proxied call', async () => {
  const asked = [];
  const { send, db } = await setup({ fetchEmail: async id => (asked.push(id), 'learner@example.com') });
  await send('/v1/responses', { body: lunaBody(), headers: { 'x-duet-feature': 'explain' } });
  assert.deepEqual(asked, [], 'a line never waits on WorkOS');
  await send('/v1/duet/me', { method: 'GET' });
  assert.deepEqual(asked, ['user_1']);
  const [user] = await db.query(`select email from users where id = 'user_1'`);
  assert.equal(user.email, 'learner@example.com');
});

test('checkout looks the email up first, so Stripe gets it', async () => {
  const stripe = fakeStripe();
  stripe.checkout.sessions.retrieve = async () => ({ status: 'expired' });
  const { send } = await setup({ stripe, fetchEmail: async () => 'learner@example.com' });
  await send('/v1/duet/billing/checkout', { body: {} });
  assert.equal(stripe.made[0][1].customer_email, 'learner@example.com');
});

/** A Stripe whose Checkout sessions have ids and a status the test can set. */
function checkoutStripe() {
  const sessions = new Map();
  const stripe = fakeStripe();
  stripe.checkout.sessions = {
    sessions,
    create: async () => {
      const session = { id: `cs_${sessions.size + 1}`, status: 'open', url: `https://checkout.stripe.com/c/${sessions.size + 1}` };
      sessions.set(session.id, session);
      return session;
    },
    retrieve: async id => sessions.get(id),
    expire: async id => (sessions.get(id).status = 'expired')
  };
  return stripe;
}

test('Upgrade opens the same Checkout session while it is open: one subscription to pay', async () => {
  const stripe = checkoutStripe();
  const { send } = await setup({ stripe });
  const first = await (await send('/v1/duet/billing/checkout', { body: {} })).json();
  const second = await (await send('/v1/duet/billing/checkout', { body: {} })).json();
  assert.equal(second.url, first.url);
  assert.equal(stripe.checkout.sessions.sessions.size, 1);
  // Paid in the browser, its webhook not here yet: no second session.
  stripe.checkout.sessions.sessions.get('cs_1').status = 'complete';
  const third = await send('/v1/duet/billing/checkout', { body: {} });
  assert.equal(third.status, 409);
  assert.equal((await third.json()).error.code, 'already_paid');
});

test('two Upgrade clicks at once give one Checkout session', async () => {
  const stripe = checkoutStripe();
  const { send } = await setup({ stripe });
  await send('/v1/duet/me', { method: 'GET' });
  const replies = await Promise.all([
    send('/v1/duet/billing/checkout', { body: {} }),
    send('/v1/duet/billing/checkout', { body: {} })
  ]);
  const urls = await Promise.all(replies.map(async reply => (await reply.json()).url));
  assert.equal(urls[0], urls[1]);
  const open = [...stripe.checkout.sessions.sessions.values()].filter(session => session.status === 'open');
  assert.equal(open.length, 1);
});

test('after a subscription ends, Upgrade makes a new Checkout session', async () => {
  const stripe = checkoutStripe();
  const { app, send, stripeLib, db } = await setup({ stripe });
  await send('/v1/duet/billing/checkout', { body: {} });
  stripe.checkout.sessions.sessions.get('cs_1').status = 'complete';
  await webhook(app, stripeLib, {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'user_1', customer: 'cus_1', subscription: 'sub_1' } }
  });
  await webhook(app, stripeLib, { id: 'evt_2', type: 'customer.subscription.deleted', data: { object: subscription('sub_1', 'canceled') } });
  const [user] = await db.query(`select plan, checkout_session from users where id = 'user_1'`);
  assert.deepEqual(user, { plan: 'free', checkout_session: null });
  const again = await (await send('/v1/duet/billing/checkout', { body: {} })).json();
  assert.equal(again.url, 'https://checkout.stripe.com/c/2');
});

test('a request sweeps its own stale live calls, and everyone\'s at most once a minute', async () => {
  const { send, move, calls, sign } = await setup({ openai: liveOpenAI });
  const other = await sign('user_2');
  const hungUp = () => calls.some(c => c.url.endsWith('/live/sessions/live_1/hangup'));
  await send('/v1/live/sessions', { body: liveBody });
  move(70_000);
  await send('/v1/duet/me', { method: 'GET', auth: other });
  // 100 s with no minute call: stale, but the last sweep of everyone was 30 s ago.
  move(30_000);
  await send('/v1/duet/me', { method: 'GET', auth: other });
  assert.equal(hungUp(), false, 'another user\'s request leaves it until the next sweep of everyone');
  move(31_000);
  await send('/v1/duet/me', { method: 'GET', auth: other });
  assert.equal(hungUp(), true);
});
