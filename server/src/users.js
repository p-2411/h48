// Users and the devices they are seen on. A user is made, Free, the first time their token is
// seen. The device rule: a new Free account on a device that already has two other Free accounts
// gets no free credits. The device id is a hash the app makes; a changed app can send another, so
// this guard stops casual abuse only (spec section 3).
import { refuse } from './errors.js';

const DEVICE = /^[0-9a-f]{64}$/;
const FREE_ACCOUNTS_PER_DEVICE = 2;

/** The user, made Free if new, in one statement (no write when the user is already there). */
export async function findOrCreateUser(db, id, now) {
  const [user] = await db.query(
    `with made as (
       insert into users (id, created_at) values ($1, $2) on conflict (id) do nothing returning *
     )
     select * from made
     union all
     select * from users where id = $1 and not exists (select 1 from made)`,
    [id, now]
  );
  if (user) return user;
  // Two first requests at once: the one whose insert waited sees no row, as its statement's
  // snapshot predates the other's commit. The row is there now.
  const [made] = await db.query(`select * from users where id = $1`, [id]);
  return made;
}

/** Records the device for the user; true when that just blocked the account's free tier. A device
 * already known for the user costs one statement. */
export async function linkDevice(db, userId, deviceId, now) {
  if (typeof deviceId !== 'string' || !DEVICE.test(deviceId)) throw refuse('device', 'The device id is not valid.');
  const [added] = await db.query(
    `insert into devices (device_id, user_id, first_seen) values ($1, $2, $3)
     on conflict do nothing returning user_id`,
    [deviceId, userId, now]
  );
  if (!added) return false;
  // Only an account seen for the first time is judged: one already in use elsewhere keeps its tier.
  const [elsewhere] = await db.query(`select 1 from devices where user_id = $1 and device_id <> $2 limit 1`, [
    userId,
    deviceId
  ]);
  if (elsewhere) return false;
  const [blocked] = await db.query(
    `update users set free_blocked = true
     where id = $1 and plan = 'free' and (
       select count(*) from devices d join users u on u.id = d.user_id
       where d.device_id = $2 and d.user_id <> $1 and u.plan = 'free' and not u.free_blocked
     ) >= $3
     returning id`,
    [userId, deviceId, FREE_ACCOUNTS_PER_DEVICE]
  );
  return Boolean(blocked);
}

export async function userByEmailOrId(db, key) {
  const [user] = await db.query(`select * from users where id = $1 or lower(email) = lower($1)`, [key]);
  return user;
}

/** Sets a plan by hand (the plan script). Gives the user, or undefined when there is none. */
export async function setPlan(db, key, plan) {
  if (plan !== 'free' && plan !== 'paid') throw new Error('The plan must be free or paid.');
  const user = await userByEmailOrId(db, key);
  if (!user) return undefined;
  const [updated] = await db.query(`update users set plan = $2 where id = $1 returning *`, [user.id, plan]);
  return updated;
}
