// The server as one function: a Web Request in, a Response out. api/index.js runs it on Vercel and
// dev.js on a local port; the tests call it directly with fakes for OpenAI and Stripe.
//
// Every route but the Stripe webhook and the cron needs a WorkOS token and a device id. Before each
// call, holds lost by calls that never finished are charged, and live calls whose app stopped
// reporting are hung up.
import { createHash } from 'node:crypto';
import { checkout, portal, webhook } from './billing.js';
import { HttpError } from './errors.js';
import { liveEnd, liveMinute, startLive, sweepLive } from './live.js';
import { meter, sweepLost } from './meter.js';
import { creditPeriod, hourPeriod, limits, MICRO_PER_CREDIT } from './plans.js';
import { chat, responses, speech, transcription } from './proxy.js';
import { fail, json } from './respond.js';
import { forwardFeedback, sendFeedback } from './feedback.js';
import { verifier } from './auth.js';
import { findOrCreateUser, linkDevice } from './users.js';
import { requireWatch, watchBeat, watchEnd, watchStart } from './watch.js';

// How often one instance sweeps every user's stale live calls on a request.
const SWEEP_ALL_EVERY_MS = 60_000;

/** The user's id as OpenAI sees it (safety_identifier): a hash, never the WorkOS id or email. */
const hashOf = id => createHash('sha256').update(`duet:${id}`).digest('hex').slice(0, 32);

async function me(ctx) {
  const { db, user, now } = ctx;
  const cap = limits(user);
  const credits = creditPeriod(user, now);
  const hours = hourPeriod(user, now);
  const spent = await meter(db, user.id, 'credits', credits.key);
  const watched = await meter(db, user.id, 'hours', hours.key);
  return json({
    plan: user.plan,
    freeBlocked: Boolean(user.free_blocked) && user.plan !== 'paid',
    credits: {
      used: (spent.used + spent.held) / MICRO_PER_CREDIT,
      cap: cap.credits / MICRO_PER_CREDIT,
      resetsAt: credits.resetsAt.toISOString()
    },
    hours: { usedMs: watched.used, capMs: cap.hoursMs, resetsAt: hours.resetsAt.toISOString() },
    billing: Boolean(ctx.deps.stripe)
  });
}

/** The token carries no email; with WORKOS_API_KEY set, the server asks WorkOS once (for the plan
 * script and Stripe Checkout). Only /me (read at sign-in) and checkout ask, so a slow WorkOS never
 * holds up the learner's lines. A failure leaves it for the next time. Gives ctx with the email. */
async function withEmail(ctx) {
  const { deps, user } = ctx;
  if (user.email || !deps.fetchEmail) return ctx;
  try {
    const email = await deps.fetchEmail(user.id);
    if (!email) return ctx;
    await deps.db.query(`update users set email = $2 where id = $1 and email is null`, [user.id, email]);
    return { ...ctx, user: { ...user, email } };
  } catch {
    // WorkOS out of reach: try on a later call.
    return ctx;
  }
}

/** Routes for a signed-in user: [method, pattern, handler(ctx, request, ...captures)]. */
const ROUTES = [
  ['POST', /^\/v1\/responses$/, async (ctx, request) => (await requireWatch(ctx, request, 'responses'), responses(ctx, request))],
  ['POST', /^\/v1\/chat\/completions$/, chat],
  ['POST', /^\/v1\/audio\/transcriptions$/, async (ctx, request) => (await requireWatch(ctx, request, 'transcription'), transcription(ctx, request))],
  ['POST', /^\/v1\/audio\/speech$/, speech],
  ['POST', /^\/v1\/live\/sessions$/, startLive],
  ['POST', /^\/v1\/duet\/live\/([^/]+)\/minute$/, (ctx, _request, id) => liveMinute(ctx, id)],
  ['POST', /^\/v1\/duet\/live\/([^/]+)\/end$/, (ctx, _request, id) => liveEnd(ctx, id)],
  ['POST', /^\/v1\/duet\/watch\/start$/, ctx => watchStart(ctx)],
  ['POST', /^\/v1\/duet\/watch\/([^/]+)\/beat$/, (ctx, _request, id) => watchBeat(ctx, id)],
  ['POST', /^\/v1\/duet\/watch\/([^/]+)\/end$/, (ctx, _request, id) => watchEnd(ctx, id)],
  ['GET', /^\/v1\/duet\/me$/, async ctx => me(await withEmail(ctx))],
  ['POST', /^\/v1\/duet\/billing\/checkout$/, async ctx => checkout(await withEmail(ctx))],
  ['POST', /^\/v1\/duet\/billing\/portal$/, portal],
  ['POST', /^\/v1\/duet\/feedback$/, async (ctx, request) => sendFeedback(await withEmail(ctx), request)]
];

/**
 * deps: db, keySet (WorkOS's keys), openaiKey, fetchOpenAI, now(), cronSecret, stripe (or null),
 * stripeLib, stripePrice, stripeWebhookSecret, fetchEmail(userId) (or null), random (ids, for tests),
 * postDiscord(message) → whether Discord took it (or null: feedback waits until a webhook is set).
 */
export function createApp(deps) {
  const verify = verifier(deps.keySet);
  // When this instance last swept everyone's live calls (see route).
  let sweptAllAt = 0;

  async function route(request) {
    const { pathname } = new URL(request.url);
    const now = deps.now();

    if (pathname === '/v1/stripe/webhook' && request.method === 'POST') return webhook(deps, deps.db, request);

    if (pathname === '/v1/duet/cron/sweep') {
      if (!deps.cronSecret || request.headers.get('authorization') !== `Bearer ${deps.cronSecret}`)
        throw new HttpError(401, 'auth', 'Not the cron.');
      await sweepLost(deps.db, null, now);
      await sweepLive({ db: deps.db, deps, now }, null);
      // Feedback Discord couldn't take yet.
      await forwardFeedback(deps, now).catch(() => undefined);
      return json({ ok: true });
    }

    const matched = ROUTES.map(([method, pattern, handler]) => [method, pathname.match(pattern), handler]).find(
      ([, match]) => match
    );
    if (!matched) throw new HttpError(404, 'not_found', 'No such route.');
    const [method, match, handler] = matched;
    if (request.method !== method) throw new HttpError(405, 'method', `Use ${method}.`);
    let captures;
    try {
      captures = match.slice(1).map(decodeURIComponent);
    } catch {
      throw new HttpError(404, 'not_found', 'No such route.');
    }

    const userId = await verify(request.headers.get('authorization'));
    let user = await findOrCreateUser(deps.db, userId, now);
    // The device rule can block a new account's free tier: then read the user again.
    if (await linkDevice(deps.db, userId, request.headers.get('x-duet-device'), now))
      [user] = await deps.db.query(`select * from users where id = $1`, [userId]);
    await sweepLost(deps.db, userId, now);
    const ctx = { db: deps.db, deps, now, userHash: hashOf(userId), user };
    // The user's own stale calls on every request; everyone's (a changed app that stopped reporting
    // and never calls again) at most once a minute here, as the cron may run only daily.
    const sweepAll = now.getTime() - sweptAllAt >= SWEEP_ALL_EVERY_MS;
    if (sweepAll) sweptAllAt = now.getTime();
    await sweepLive(ctx, sweepAll ? null : userId);
    return handler(ctx, request, ...captures);
  }

  return async function handle(request) {
    try {
      const response = await route(request);
      return response instanceof HttpError ? fail(response) : response;
    } catch (error) {
      if (error instanceof HttpError) return fail(error);
      // Never the request or its headers: they carry the user's token.
      console.error('[duet-api]', error instanceof Error ? error.message : 'error');
      return fail(new HttpError(500, 'server', 'Something went wrong.'));
    }
  };
}
