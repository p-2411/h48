// What each plan may use, and the periods the meters count in.
//
// Money is kept in whole micro-dollars (µ$): 1 credit is $0.01, so 10,000 µ$. Watch time is kept
// in milliseconds. The caps are here, not in the database, so a change to them is a reviewed commit.

export const MICRO_PER_CREDIT = 10_000;
const HOUR_MS = 3600_000;

const PLANS = {
  free: { credits: 200, hours: 2 },
  paid: { credits: 600, hours: 40 }
};

/** The caps for a user: credits in µ$ and hours in ms. A Free account blocked on its device gets no credits. */
export function limits(user) {
  const plan = PLANS[user.plan] ?? PLANS.free;
  const blocked = user.plan !== 'paid' && user.free_blocked;
  return { credits: blocked ? 0 : plan.credits * MICRO_PER_CREDIT, hoursMs: plan.hours * HOUR_MS };
}

const day = date => date.toISOString().slice(0, 10);

function calendarMonth(now) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    key: `m${start.toISOString().slice(0, 7)}`,
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  };
}

function week(now) {
  // getUTCDay: Sunday is 0. Days since Monday: (day + 6) % 7.
  const back = (now.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
  return { key: `w${day(start)}`, resetsAt: new Date(start.getTime() + 7 * 24 * HOUR_MS) };
}

/** A paid user's billing period from Stripe, while now is inside it. */
function billingPeriod(user, now) {
  if (user.plan !== 'paid' || !user.period_start || !user.period_end) return undefined;
  const start = new Date(user.period_start);
  const end = new Date(user.period_end);
  if (now < start || now >= end) return undefined;
  return { key: `p${start.toISOString()}`, resetsAt: end };
}

/** The period the credits meter counts in: the billing period for Paid, else the calendar month (UTC). */
export function creditPeriod(user, now = new Date()) {
  return billingPeriod(user, now) ?? calendarMonth(now);
}

/** The period the hours meter counts in: Monday to Monday (UTC) for Free, the credits' period for Paid. */
export function hourPeriod(user, now = new Date()) {
  if (user.plan === 'paid') return creditPeriod(user, now);
  return week(now);
}
