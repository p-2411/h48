// The meters: hold an estimate before a call, then charge the real cost (or free the hold).
//
// Every change is one SQL statement, so it is atomic on its own: a hold checks the cap and takes
// the room in the same UPDATE, and calls sent at the same moment cannot pass the cap together.
// Times come in as `now`, so the rules can be tested at any moment.

// A hold whose call never came back (the function stopped) is charged at its estimate after this.
export const LOST_AFTER_MS = 15 * 60_000;

const num = value => Number(value ?? 0);

async function ensureMeter(db, userId, kind, period) {
  await db.query(
    `insert into meters (user_id, kind, period) values ($1, $2, $3) on conflict do nothing`,
    [userId, kind, period]
  );
}

export async function meter(db, userId, kind, period) {
  const [row] = await db.query(
    `select used, held from meters where user_id = $1 and kind = $2 and period = $3`,
    [userId, kind, period]
  );
  return { used: num(row?.used), held: num(row?.held) };
}

/** Takes `amount` µ$ of room under `cap`. Gives the charge id, or null when the cap is reached. */
export async function hold(db, { userId, period, cap, amount, route, model, now }) {
  await ensureMeter(db, userId, 'credits', period);
  const [row] = await db.query(
    `with m as (
       update meters set held = held + $4
       where user_id = $1 and kind = 'credits' and period = $2 and used + held + $4 <= $3
       returning user_id
     )
     insert into charges (user_id, kind, period, route, model, held, status, created_at)
     select $1, 'credits', $2, $5, $6, $4, 'held', $7 from m
     returning id`,
    [userId, period, cap, amount, route, model ?? null, now]
  );
  return row ? String(row.id) : null;
}

/** Grows a hold still open (live voice) to `target` µ$, if the cap allows. False when the cap is
 * reached or the hold is no longer open. The charge row is locked first (FOR UPDATE), so a second
 * call at the same moment waits and then sees the first one's hold: the room is taken once. */
export async function growTo(db, chargeId, target, cap) {
  const [row] = await db.query(
    `with c as (
       select id, user_id, kind, period, greatest($2::bigint - held, 0) as extra
       from charges where id = $1 and status = 'held'
       for update
     ), m as (
       update meters set held = meters.held + c.extra
       from c
       where meters.user_id = c.user_id and meters.kind = c.kind and meters.period = c.period
         and meters.used + meters.held + c.extra <= $3
       returning c.extra
     )
     update charges set held = charges.held + m.extra
     from m
     where charges.id = $1
     returning charges.id`,
    [chargeId, target, cap]
  );
  return Boolean(row);
}

/** Charges the real cost and lets the hold go; a cost of null charges the hold itself (the reply
 * could not be read). A charge already settled is left as it is. */
export async function settle(db, chargeId, cost, usage, now) {
  await db.query(
    `with c as (
       update charges set status = 'charged', cost = coalesce($2::bigint, held), usage = $3::jsonb, settled_at = $4
       where id = $1 and status = 'held'
       returning user_id, kind, period, held, cost
     )
     update meters set used = meters.used + c.cost, held = meters.held - c.held
     from c
     where meters.user_id = c.user_id and meters.kind = c.kind and meters.period = c.period`,
    [chargeId, cost, JSON.stringify(usage ?? null), now]
  );
}

/** Frees a hold without charging (the call failed at OpenAI, or was refused). */
export async function release(db, chargeId, now) {
  await db.query(
    `with c as (
       update charges set status = 'freed', cost = 0, settled_at = $2
       where id = $1 and status = 'held'
       returning user_id, kind, period, held
     )
     update meters set held = meters.held - c.held
     from c
     where meters.user_id = c.user_id and meters.kind = c.kind and meters.period = c.period`,
    [chargeId, now]
  );
}

/** Charges, at their estimate, holds older than LOST_AFTER_MS: one user's, or everyone's when
 * `userId` is null (the cron). Live voice holds stay open for the length of a call and are settled
 * by the live voice code instead, unless no session was ever recorded for them. */
export async function sweepLost(db, userId, now) {
  await db.query(
    `with c as (
       update charges set status = 'charged', cost = held, settled_at = $2
       where ($1::text is null or user_id = $1) and status = 'held' and created_at < $3
         and (route <> 'live' or not exists (select 1 from live_sessions s where s.charge_id = charges.id))
       returning user_id, kind, period, held
     ), s as (
       select user_id, kind, period, sum(held) as total from c group by user_id, kind, period
     )
     update meters set used = meters.used + s.total, held = meters.held - s.total
     from s
     where meters.user_id = s.user_id and meters.kind = s.kind and meters.period = s.period`,
    [userId, now, new Date(now.getTime() - LOST_AFTER_MS)]
  );
}

/** Adds watch time to the hours meter, never past the cap. `full` says the cap is reached. */
export async function addWatch(db, userId, period, ms, cap) {
  await ensureMeter(db, userId, 'hours', period);
  const [row] = await db.query(
    `update meters set used = least(used + $3, $4)
     where user_id = $1 and kind = 'hours' and period = $2
     returning used`,
    [userId, period, Math.max(0, Math.round(ms)), cap]
  );
  const used = num(row?.used);
  return { used, full: used >= cap };
}
