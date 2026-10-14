import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errors } from 'jose';
import { verifier } from '../src/auth.js';
import { findOrCreateUser, linkDevice } from '../src/users.js';
import { at, freshDb, keys } from './helpers.js';

const NOW = at('2026-10-13T10:00:00Z');
const DEVICE = 'a'.repeat(64);

test('a user is made Free on first sight and found after', async () => {
  const db = await freshDb();
  const made = await findOrCreateUser(db, 'u1', NOW);
  assert.equal(made.plan, 'free');
  assert.equal(made.free_blocked, false);
  const found = await findOrCreateUser(db, 'u1', at('2026-10-14T00:00:00Z'));
  assert.equal(new Date(found.created_at).toISOString(), NOW.toISOString());
});

test('a third new Free account on one device gets no free credits', async () => {
  const db = await freshDb();
  for (const id of ['u1', 'u2', 'u3']) {
    await findOrCreateUser(db, id, NOW);
    await linkDevice(db, id, DEVICE, NOW);
  }
  const blocked = await findOrCreateUser(db, 'u3', NOW);
  assert.equal(blocked.free_blocked, true);
  assert.equal((await findOrCreateUser(db, 'u2', NOW)).free_blocked, false);
});

test('an account that already has a device is not blocked on a new one', async () => {
  const db = await freshDb();
  await findOrCreateUser(db, 'u9', NOW);
  await linkDevice(db, 'u9', 'b'.repeat(64), NOW);
  for (const id of ['u1', 'u2']) {
    await findOrCreateUser(db, id, NOW);
    await linkDevice(db, id, DEVICE, NOW);
  }
  await linkDevice(db, 'u9', DEVICE, NOW);
  assert.equal((await findOrCreateUser(db, 'u9', NOW)).free_blocked, false);
});

test('Paid accounts on the device do not count toward the two', async () => {
  const db = await freshDb();
  await findOrCreateUser(db, 'p1', NOW);
  await db.query(`update users set plan = 'paid' where id = 'p1'`);
  await linkDevice(db, 'p1', DEVICE, NOW);
  for (const id of ['u1', 'u2']) {
    await findOrCreateUser(db, id, NOW);
    await linkDevice(db, id, DEVICE, NOW);
  }
  assert.equal((await findOrCreateUser(db, 'u2', NOW)).free_blocked, false);
});

test('a device id must be a 64-character hex hash', async () => {
  const db = await freshDb();
  await findOrCreateUser(db, 'u1', NOW);
  await assert.rejects(linkDevice(db, 'u1', 'not-a-hash', NOW), error => error.status === 400 && error.code === 'device');
});

test('a token signed by WorkOS\'s key gives the user id', async () => {
  const { keySet, sign } = await keys();
  const verify = verifier(keySet);
  assert.equal(await verify(`Bearer ${await sign('user_01')}`), 'user_01');
});

test('a missing, expired or forged token is refused with 401', async () => {
  const { keySet, sign } = await keys();
  const other = await keys();
  const verify = verifier(keySet);
  const unauthorised = error => error.status === 401 && error.code === 'auth';
  await assert.rejects(verify(undefined), unauthorised);
  await assert.rejects(verify('Bearer nonsense'), unauthorised);
  await assert.rejects(verify(`Bearer ${await sign('u', { expiresIn: '-1m' })}`), unauthorised);
  // Signed with another key under the same key id.
  await assert.rejects(verify(`Bearer ${await other.sign('u')}`), unauthorised);
});

test('WorkOS\'s keys out of reach is a 503, not a sign-in refused', async () => {
  const { sign } = await keys();
  const verify = verifier(async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(verify(`Bearer ${await sign('u')}`), error => error.status === 503 && error.code === 'auth_unavailable');
  // WorkOS answered with JSON that is not a key set: also the server's trouble.
  const malformed = verifier(async () => {
    throw new errors.JWKSInvalid('JSON Web Key Set malformed');
  });
  await assert.rejects(malformed(`Bearer ${await sign('u')}`), error => error.status === 503);
});

test('a user made by another request at the same moment is read again, not lost', async () => {
  // The combined statement saw no row (its snapshot predates the other insert); the second read does.
  const answers = [[], [{ id: 'u1', plan: 'free' }]];
  const db = { query: async () => answers.shift() };
  assert.deepEqual(await findOrCreateUser(db, 'u1', NOW), { id: 'u1', plan: 'free' });
});
