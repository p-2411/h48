// Watch hours (piece B). The app opens a watch session while the learner watches with Duet and
// beats every 30 s; the server adds the time since the last beat by its own clock, at most 45 s a
// beat. Lines and hearing go through only inside a session with a recent beat (spec section 11).
import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.js';
import { addWatch, meter } from './meter.js';
import { hourPeriod, limits } from './plans.js';
import { capReached, json } from './respond.js';

export const BEAT_EVERY_MS = 30_000;
// A beat adds at most this, so a stopped app or a sleeping Mac adds no more.
const MOST_PER_BEAT_MS = 45_000;
// Lines need a beat at least this recent.
const FRESH_MS = 60_000;

/** The features that run only while watching; a Responses or transcription call with no feature named counts as one. */
const WATCHED = new Set(['lines', 'hearing']);

async function hoursFull(ctx) {
  const period = hourPeriod(ctx.user, ctx.now);
  const { used } = await meter(ctx.db, ctx.user.id, 'hours', period.key);
  return { full: used >= limits(ctx.user).hoursMs, period };
}

async function addTime(ctx, ms) {
  const period = hourPeriod(ctx.user, ctx.now);
  const result = await addWatch(ctx.db, ctx.user.id, period.key, ms, limits(ctx.user).hoursMs);
  return { ...result, period };
}

export async function watchStart(ctx) {
  // Opening a session adds nothing, but makes sure the meter is there.
  const { full, period } = await addTime(ctx, 0);
  if (full) throw capReached('hours', period.resetsAt);
  await ctx.db.query(`update watch_sessions set ended_at = $2 where user_id = $1 and ended_at is null`, [ctx.user.id, ctx.now]);
  const id = (ctx.deps.random ?? randomUUID)();
  await ctx.db.query(
    `insert into watch_sessions (id, user_id, started_at, last_beat_at) values ($1, $2, $3, $3)`,
    [id, ctx.user.id, ctx.now]
  );
  return json({ id, beatEveryMs: BEAT_EVERY_MS });
}

async function openWatch(ctx, id) {
  const [session] = await ctx.db.query(
    `select id, last_beat_at from watch_sessions where id = $1 and user_id = $2 and ended_at is null`,
    [id, ctx.user.id]
  );
  return session;
}

/** Adds the time since the last beat (at most 45 s) and moves the beat on. */
async function beatOnce(ctx, session) {
  const since = ctx.now.getTime() - new Date(session.last_beat_at).getTime();
  const result = await addTime(ctx, Math.min(Math.max(0, since), MOST_PER_BEAT_MS));
  await ctx.db.query(`update watch_sessions set last_beat_at = $2 where id = $1`, [session.id, ctx.now]);
  return result;
}

export async function watchBeat(ctx, id) {
  const session = await openWatch(ctx, id);
  if (!session) throw new HttpError(404, 'watch', 'No such watch session.');
  const { used, full, period } = await beatOnce(ctx, session);
  if (full) {
    await ctx.db.query(`update watch_sessions set ended_at = $2 where id = $1`, [id, ctx.now]);
    throw capReached('hours', period.resetsAt);
  }
  return json({ ok: true, usedMs: used });
}

export async function watchEnd(ctx, id) {
  const session = await openWatch(ctx, id);
  if (session) {
    await beatOnce(ctx, session);
    await ctx.db.query(`update watch_sessions set ended_at = $2 where id = $1`, [id, ctx.now]);
  }
  return json({ ok: true });
}

/** Lets a call through only when it needs no watching, or comes inside a fresh watch session. */
export async function requireWatch(ctx, request, route) {
  const feature = request.headers.get('x-duet-feature') ?? (route === 'transcription' ? 'hearing' : 'lines');
  if (!WATCHED.has(feature)) return;
  const { full, period } = await hoursFull(ctx);
  if (full) throw capReached('hours', period.resetsAt);
  const id = request.headers.get('x-duet-watch');
  const session = id ? await openWatch(ctx, id) : undefined;
  if (!session || ctx.now.getTime() - new Date(session.last_beat_at).getTime() > FRESH_MS)
    throw new HttpError(409, 'watch_required', 'Open a watch session first.');
}
