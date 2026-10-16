import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addWatch, growTo, hold, meter, release, settle, sweepLost } from '../src/meter.js';
import { findOrCreateUser } from '../src/users.js';
import { at, freshDb } from './helpers.js';

const NOW = at('2026-10-13T10:00:00Z');
const P = 'm2026-10';

async function withUser() {
  const db = await freshDb();
  await findOrCreateUser(db, 'u1', NOW);
  return db;
}

const call = (amount, extra = {}) => ({ userId: 'u1', period: P, cap: 1000, amount, route: 'responses', model: 'gpt-6-luna', now: NOW, ...extra });

test('a hold under the cap is taken and shows as held', async () => {
  const db = await withUser();
  const id = await hold(db, call(400));
  assert.ok(id);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 400 });
});

test('a hold that would pass the cap is refused', async () => {
  const db = await withUser();
  assert.ok(await hold(db, call(600)));
  assert.equal(await hold(db, call(500)), null);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 600 });
});

test('charging moves the hold to used at the real cost', async () => {
  const db = await withUser();
  const id = await hold(db, call(400));
  await settle(db, id, 123, { input_tokens: 1 }, NOW);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 123, held: 0 });
  // A second charge of the same hold does nothing.
  await settle(db, id, 999, {}, NOW);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 123, held: 0 });
});

test('a real cost above the hold is still charged in full', async () => {
  const db = await withUser();
  const id = await hold(db, call(100));
  await settle(db, id, 150, {}, NOW);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 150, held: 0 });
});

test('freeing a hold gives it back', async () => {
  const db = await withUser();
  const id = await hold(db, call(400));
  await release(db, id, NOW);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 0 });
  await release(db, id, NOW);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 0 });
});

test('many holds at the same moment never pass the cap together', async () => {
  const db = await withUser();
  const ids = await Promise.all(Array.from({ length: 25 }, () => hold(db, call(100))));
  assert.equal(ids.filter(Boolean).length, 10);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 1000 });
});

test('a hold left by a call that never finished is charged at its estimate after 15 minutes', async () => {
  const db = await withUser();
  await hold(db, call(300));
  await sweepLost(db, 'u1', at('2026-10-13T10:14:00Z'));
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 300 });
  await sweepLost(db, 'u1', at('2026-10-13T10:16:00Z'));
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 300, held: 0 });
});

test('a live voice hold with its call is never swept as lost', async () => {
  const db = await withUser();
  const id = await hold(db, call(300, { route: 'live' }));
  await db.query(
    `insert into live_sessions (id, user_id, charge_id, started_at, last_minute_at) values ('live_1', 'u1', $1, $2, $2)`,
    [id, NOW]
  );
  await sweepLost(db, 'u1', at('2026-10-13T11:00:00Z'));
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 300 });
});

test('a live voice hold whose call was never recorded is swept as lost', async () => {
  const db = await withUser();
  await hold(db, call(300, { route: 'live' }));
  await sweepLost(db, 'u1', at('2026-10-13T11:00:00Z'));
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 300, held: 0 });
});

test('a hold grows to a target while the cap allows', async () => {
  const db = await withUser();
  const id = await hold(db, call(300, { route: 'live' }));
  assert.equal(await growTo(db, id, 800, 1000), true);
  // The same target again (an overlapping or repeated minute call) adds nothing.
  assert.equal(await growTo(db, id, 800, 1000), true);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 800 });
  assert.equal(await growTo(db, id, 1300, 1000), false);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 800 });
  await settle(db, id, 700, {}, NOW);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 700, held: 0 });
  assert.equal(await growTo(db, id, 900, 1000), false, 'a settled hold does not grow');
});

test('holds growing at the same moment add their room once', async () => {
  const db = await withUser();
  const id = await hold(db, call(300, { route: 'live' }));
  const grown = await Promise.all([growTo(db, id, 600, 1000), growTo(db, id, 600, 1000)]);
  assert.deepEqual(grown, [true, true]);
  assert.deepEqual(await meter(db, 'u1', 'credits', P), { used: 0, held: 600 });
});

test('each period has its own meter', async () => {
  const db = await withUser();
  assert.ok(await hold(db, call(1000)));
  assert.ok(await hold(db, call(1000, { period: 'm2026-11' })));
});

test('watch time adds up to the cap and says when the cap is reached', async () => {
  const db = await withUser();
  assert.deepEqual(await addWatch(db, 'u1', 'w2026-10-12', 30_000, 60_000), { used: 30_000, full: false });
  assert.deepEqual(await addWatch(db, 'u1', 'w2026-10-12', 45_000, 60_000), { used: 60_000, full: true });
  assert.deepEqual(await addWatch(db, 'u1', 'w2026-10-12', 0, 60_000), { used: 60_000, full: true });
});
