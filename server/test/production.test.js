import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionDeps } from '../src/production.js';
import { setPlan } from '../src/users.js';
import { at, freshDb } from './helpers.js';

const env = {
  OPENAI_API_KEY: 'sk-test',
  WORKOS_CLIENT_ID: 'client_123',
  DATABASE_URL: 'postgres://user:pass@example.neon.tech/db',
  CRON_SECRET: 'c'
};

test('the server will not start without its key, WorkOS client id or database', () => {
  for (const name of ['OPENAI_API_KEY', 'WORKOS_CLIENT_ID', 'DATABASE_URL']) {
    const missing = { ...env, [name]: '' };
    assert.throws(() => productionDeps(missing), new RegExp(name));
  }
});

test('Stripe is set up only when all three of its settings are there', () => {
  assert.equal(productionDeps(env).stripe, null);
  const paid = productionDeps({ ...env, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_ID: 'price_1', STRIPE_WEBHOOK_SECRET: 'whsec_x' });
  assert.ok(paid.stripe);
  assert.equal(paid.stripePrice, 'price_1');
});

test('the email lookup is there only with a WorkOS API key', () => {
  assert.equal(productionDeps(env).fetchEmail, null);
  assert.equal(typeof productionDeps({ ...env, WORKOS_API_KEY: 'sk_workos' }).fetchEmail, 'function');
});

test('the plan script sets a plan by user id or email', async () => {
  const db = await freshDb();
  await db.query(`insert into users (id, email, created_at) values ('user_1', 'a@example.com', $1)`, [at('2026-10-13T00:00:00Z')]);
  assert.equal((await setPlan(db, 'A@example.com', 'paid')).plan, 'paid');
  assert.equal((await setPlan(db, 'user_1', 'free')).plan, 'free');
  assert.equal(await setPlan(db, 'nobody', 'paid'), undefined);
  await assert.rejects(setPlan(db, 'user_1', 'gold'), /free or paid/);
});

test('the email lookup gives up after a few seconds, so WorkOS being slow never holds a request', async () => {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => (seen.push(init.signal), Response.json({ email: 'a@example.com' }));
  try {
    const { fetchEmail } = productionDeps({ ...env, WORKOS_API_KEY: 'sk_workos' });
    assert.equal(await fetchEmail('user_1'), 'a@example.com');
    assert.ok(seen[0] instanceof AbortSignal, 'the lookup has a time limit');
  } finally {
    globalThis.fetch = real;
  }
});
