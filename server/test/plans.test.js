import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creditPeriod, hourPeriod, limits, MICRO_PER_CREDIT } from '../src/plans.js';

const at = iso => new Date(iso);

test('a free user has 200 credits a month and 2 hours a week', () => {
  assert.deepEqual(limits({ plan: 'free' }), { credits: 200 * MICRO_PER_CREDIT, hoursMs: 2 * 3600_000 });
  assert.equal(MICRO_PER_CREDIT, 10_000);
});

test('a paid user has 600 credits and 40 hours a month', () => {
  assert.deepEqual(limits({ plan: 'paid' }), { credits: 600 * MICRO_PER_CREDIT, hoursMs: 40 * 3600_000 });
});

test('a free user blocked on this device has no credits', () => {
  assert.equal(limits({ plan: 'free', free_blocked: true }).credits, 0);
  assert.equal(limits({ plan: 'paid', free_blocked: true }).credits, 600 * MICRO_PER_CREDIT);
});

test('free credits run by calendar month in UTC', () => {
  const period = creditPeriod({ plan: 'free' }, at('2026-10-31T23:59:59Z'));
  assert.deepEqual(period, { key: 'm2026-10', resetsAt: at('2026-11-01T00:00:00Z') });
  assert.equal(creditPeriod({ plan: 'free' }, at('2026-12-15T00:00:00Z')).resetsAt.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('free hours run Monday to Monday in UTC', () => {
  // 2026-10-13 is a Tuesday; the week began on Monday 12 October.
  assert.deepEqual(hourPeriod({ plan: 'free' }, at('2026-10-13T10:00:00Z')), {
    key: 'w2026-10-12',
    resetsAt: at('2026-10-19T00:00:00Z')
  });
  // A Sunday night belongs to the week that began the Monday before.
  assert.equal(hourPeriod({ plan: 'free' }, at('2026-10-18T23:00:00Z')).key, 'w2026-10-12');
  assert.equal(hourPeriod({ plan: 'free' }, at('2026-10-19T00:00:00Z')).key, 'w2026-10-19');
});

test('paid periods follow the billing period while it lasts', () => {
  const user = {
    plan: 'paid',
    period_start: at('2026-10-05T12:00:00Z'),
    period_end: at('2026-11-05T12:00:00Z')
  };
  const expected = { key: 'p2026-10-05T12:00:00.000Z', resetsAt: at('2026-11-05T12:00:00Z') };
  assert.deepEqual(creditPeriod(user, at('2026-10-20T00:00:00Z')), expected);
  assert.deepEqual(hourPeriod(user, at('2026-10-20T00:00:00Z')), expected);
  // Past the end (a renewal not yet heard of), the calendar month is used.
  assert.equal(creditPeriod(user, at('2026-11-06T00:00:00Z')).key, 'm2026-11');
});

test('a paid user without a billing period uses the calendar month for both', () => {
  assert.equal(hourPeriod({ plan: 'paid' }, at('2026-10-13T00:00:00Z')).key, 'm2026-10');
});
