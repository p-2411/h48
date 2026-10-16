// Feedback: kept in the database, forwarded to Discord, mentions never pinged, a limit per hour, and
// waiting feedback sent once Discord takes it again.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Stripe from 'stripe';
import { createApp } from '../src/app.js';
import { at, freshDb, keys } from './helpers.js';

const DEVICE = 'd'.repeat(64);

async function setup({ discordUp = true } = {}) {
  const db = await freshDb();
  const { keySet, sign } = await keys();
  const posted = [];
  const discord = { up: discordUp };
  let now = at('2026-10-17T10:00:00Z');
  const app = createApp({
    db,
    keySet,
    openaiKey: 'sk-test',
    fetchOpenAI: async () => Response.json({}),
    now: () => now,
    cronSecret: 'cron-secret',
    stripe: null,
    stripeLib: new Stripe('sk_test_fake'),
    stripePrice: 'price_1',
    stripeWebhookSecret: '',
    fetchEmail: async () => 'learner@example.com',
    postDiscord: async message => {
      if (!discord.up) return false;
      posted.push(message);
      return true;
    }
  });
  const token = await sign('user_1');
  const send = (body, path = '/v1/duet/feedback', headers = {}) =>
    app(
      new Request(`https://api.test${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'x-duet-device': DEVICE, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })
    );
  return { db, app, send, posted, discord, later: ms => (now = new Date(now.getTime() + ms)) };
}

test('feedback is kept, then forwarded to Discord with its details', async () => {
  const { db, send, posted } = await setup();
  const response = await send({
    message: 'The strip hides when I click Chrome. @everyone look',
    details: { version: '1.2.0', platform: 'darwin 26.1', language: 'es', place: 'settings', errors: ['Could not reach OpenAI.'] },
    replyTo: true
  });
  assert.equal(response.status, 200);
  const [row] = await db.query('select * from feedback');
  assert.equal(row.message, 'The strip hides when I click Chrome. @everyone look');
  assert.equal(row.reply_to, 'learner@example.com', 'the email, as they asked to be answered');
  assert.ok(row.forwarded_at, 'marked as forwarded');
  assert.equal(posted.length, 1);
  const [message] = posted;
  assert.deepEqual(message.allowed_mentions, { parse: [] }, 'mentions in the text never ping anyone');
  assert.match(message.embeds[0].description, /strip hides/);
  const names = message.embeds[0].fields.map(field => field.name);
  assert.deepEqual(names, ['Reply to', 'Duet', 'System', 'Learning', 'Sent from', 'Recent errors']);
});

test('no email unless asked; empty feedback is refused', async () => {
  const { db, send } = await setup();
  await send({ message: 'Love it' });
  const [row] = await db.query('select reply_to from feedback');
  assert.equal(row.reply_to, null);
  assert.equal((await send({ message: '   ' })).status, 400);
});

test('at most 10 an hour from one learner', async () => {
  const { send, later } = await setup();
  for (let i = 0; i < 10; i++) assert.equal((await send({ message: `note ${i}` })).status, 200);
  assert.equal((await send({ message: 'one more' })).status, 429);
  later(3_600_001);
  assert.equal((await send({ message: 'an hour on' })).status, 200);
});

test('Discord down: feedback is still kept, and the cron sends it later', async () => {
  const { db, app, send, posted, discord } = await setup({ discordUp: false });
  assert.equal((await send({ message: 'kept anyway' })).status, 200, 'the learner never sees Discord fail');
  let [row] = await db.query('select forwarded_at, tries from feedback');
  assert.equal(row.forwarded_at, null);
  assert.equal(row.tries, 1);
  discord.up = true;
  const cron = await app(new Request('https://api.test/v1/duet/cron/sweep', { headers: { authorization: 'Bearer cron-secret' } }));
  assert.equal(cron.status, 200);
  [row] = await db.query('select forwarded_at from feedback');
  assert.ok(row.forwarded_at, 'sent once Discord took it');
  assert.equal(posted.length, 1);
});
