// Live voice. The server makes the session (the SDP exchange); then the audio goes straight between
// the app and OpenAI. The server charges by its own clock, from the start to the end, and can hang
// the session up at OpenAI, so a changed app cannot talk past the cap (spec section 6).
import { liveCost } from './cost.js';
import { HttpError } from './errors.js';
import { grow, release } from './meter.js';
import { creditPeriod, limits } from './plans.js';
import { price } from './prices.js';
import { callOpenAI, holdFor } from './proxy.js';
import { json, readJson } from './respond.js';
import { checkLive } from './rules.js';

// The hold always covers this much time ahead of now.
const AHEAD_MS = 120_000;
// A session with no minute call for this long is hung up and charged up to its last minute call
// plus one minute.
export const LIVE_STALE_MS = 90_000;

/**
 * Ends open sessions and charges each by its length, in one statement. `where` picks the sessions
 * ($3, $4 are its values); `end` is the end time. Gives the ids ended, to hang up at OpenAI.
 */
async function endLive(db, now, where, values, end = '$1') {
  const rows = await db.query(
    `with s as (
       update live_sessions set ended_at = ${end}
       where ${where} and ended_at is null
       returning id, charge_id, started_at, ended_at
     ), c as (
       update charges set status = 'charged', settled_at = $1,
         cost = ceil(extract(epoch from (s.ended_at - s.started_at)) * $2::numeric / 60)::bigint
       from s
       where charges.id = s.charge_id and charges.status = 'held'
       returning charges.user_id, charges.kind, charges.period, charges.held, charges.cost
     ), t as (
       select user_id, kind, period, sum(held) as held, sum(cost) as cost from c group by user_id, kind, period
     ), m as (
       update meters set used = meters.used + t.cost, held = meters.held - t.held
       from t
       where meters.user_id = t.user_id and meters.kind = t.kind and meters.period = t.period
       returning 1
     )
     select id from s`,
    [now, Math.round(price('gpt-live-1').perMinute * 1e6), ...values]
  );
  return rows.map(row => row.id);
}

/** Hangs sessions up at OpenAI. Best effort: a session the app already closed is gone there too. */
async function hangUp(ctx, ids) {
  await Promise.all(
    ids.map(id =>
      callOpenAI(ctx, `/v1/live/sessions/${encodeURIComponent(id)}/hangup`, {}).catch(() => {
        // Already closed, or OpenAI out of reach: the session ends by itself on OpenAI's side.
      })
    )
  );
}

export async function startLive(ctx, request) {
  const { body, model } = checkLive(await readJson(request));
  // One open call a user: a new call ends the one before.
  await hangUp(ctx, await endLive(ctx.db, ctx.now, 'user_id = $3', [ctx.user.id]));
  const chargeId = await holdFor(ctx, { amount: liveCost(AHEAD_MS), route: 'live', model });
  let upstream;
  try {
    upstream = await callOpenAI(ctx, '/v1/live/sessions', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    await release(ctx.db, chargeId, ctx.now);
    throw error;
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    await release(ctx.db, chargeId, ctx.now);
    if (upstream.status === 401 || upstream.status === 403) throw new HttpError(502, 'upstream', 'OpenAI refused the server.');
    return new Response(text, { status: upstream.status, headers: { 'content-type': 'application/json' } });
  }
  // Live holds are settled only through their session row (sweepLost skips them), so a hold with no
  // row must be freed here, or it would stay held for good.
  let id;
  try {
    id = JSON.parse(text)?.session?.id;
  } catch {
    id = undefined;
  }
  if (typeof id !== 'string' || !id) {
    await release(ctx.db, chargeId, ctx.now);
    throw new HttpError(502, 'upstream', 'OpenAI gave no session id.');
  }
  try {
    await ctx.db.query(
      `insert into live_sessions (id, user_id, charge_id, started_at, last_minute_at) values ($1, $2, $3, $4, $4)`,
      [id, ctx.user.id, chargeId, ctx.now]
    );
  } catch (error) {
    await release(ctx.db, chargeId, ctx.now);
    await hangUp(ctx, [id]);
    throw error;
  }
  return new Response(text, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function openSession(ctx, id) {
  const [session] = await ctx.db.query(
    `select s.id, s.started_at, s.charge_id, c.held
     from live_sessions s join charges c on c.id = s.charge_id
     where s.id = $1 and s.user_id = $2 and s.ended_at is null`,
    [id, ctx.user.id]
  );
  if (!session) throw new HttpError(404, 'live', 'No such call.');
  return session;
}

/** The app's minute call: keeps the hold ahead of the clock, or ends the call at the cap. */
export async function liveMinute(ctx, id) {
  const session = await openSession(ctx, id);
  const elapsed = ctx.now.getTime() - new Date(session.started_at).getTime();
  const extra = liveCost(elapsed + AHEAD_MS) - Number(session.held);
  if (extra > 0 && !(await grow(ctx.db, session.charge_id, extra, limits(ctx.user).credits))) {
    const ended = await endLive(ctx.db, ctx.now, 'id = $3 and user_id = $4', [id, ctx.user.id]);
    // grow also fails when the call was ended meanwhile (a new call, an end, a sweep): not the cap.
    if (!ended.length) throw new HttpError(404, 'live', 'No such call.');
    await hangUp(ctx, ended);
    return json({ stop: true, cap: 'credits', resets_at: creditPeriod(ctx.user, ctx.now).resetsAt.toISOString() });
  }
  await ctx.db.query(`update live_sessions set last_minute_at = $2 where id = $1`, [id, ctx.now]);
  return json({ stop: false });
}

export async function liveEnd(ctx, id) {
  await hangUp(ctx, await endLive(ctx.db, ctx.now, 'id = $3 and user_id = $4', [id, ctx.user.id]));
  return json({ ok: true });
}

/** Ends calls whose app stopped reporting: hung up, and charged to the last minute call plus one. */
export async function sweepLive(ctx) {
  const cutoff = new Date(ctx.now.getTime() - LIVE_STALE_MS);
  const ended = await endLive(ctx.db, ctx.now, 'last_minute_at < $3', [cutoff], `least(last_minute_at + interval '60 seconds', $1)`);
  await hangUp(ctx, ended);
}
