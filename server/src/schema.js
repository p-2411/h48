// The database's tables. Each statement can run again safely, so `npm run migrate` (and the tests)
// run them all. Money is in whole micro-dollars (µ$) and watch time in milliseconds.
export const SCHEMA = [
  `create table if not exists users (
    id text primary key,
    email text,
    plan text not null default 'free',
    free_blocked boolean not null default false,
    stripe_customer text unique,
    stripe_subscription text,
    period_start timestamptz,
    period_end timestamptz,
    created_at timestamptz not null
  )`,
  // Which users each device has been seen with (the device id is a hash, never the hardware id).
  `create table if not exists devices (
    device_id text not null,
    user_id text not null references users (id),
    first_seen timestamptz not null,
    primary key (device_id, user_id)
  )`,
  // One row per user, meter (credits or hours) and period: what is spent, and what is held for
  // calls in flight.
  `create table if not exists meters (
    user_id text not null references users (id),
    kind text not null,
    period text not null,
    used bigint not null default 0,
    held bigint not null default 0,
    primary key (user_id, kind, period)
  )`,
  // Each call's hold and then its real cost.
  `create table if not exists charges (
    id bigserial primary key,
    user_id text not null references users (id),
    kind text not null default 'credits',
    period text not null,
    route text not null,
    model text,
    held bigint not null,
    cost bigint,
    status text not null,
    usage jsonb,
    created_at timestamptz not null,
    settled_at timestamptz
  )`,
  `create index if not exists charges_held on charges (user_id) where status = 'held'`,
  // The Stripe Checkout session last opened for the user: Upgrade opens it again while it is open,
  // so two tabs (or two clicks) cannot pay for two subscriptions.
  `alter table users add column if not exists checkout_session text`,
  `create table if not exists live_sessions (
    id text primary key,
    user_id text not null references users (id),
    charge_id bigint not null references charges (id),
    started_at timestamptz not null,
    last_minute_at timestamptz not null,
    ended_at timestamptz
  )`,
  `create index if not exists live_open on live_sessions (user_id) where ended_at is null`,
  // sweepLost asks whether a held live charge has its session.
  `create index if not exists live_charge on live_sessions (charge_id)`,
  `create table if not exists watch_sessions (
    id text primary key,
    user_id text not null references users (id),
    started_at timestamptz not null,
    last_beat_at timestamptz not null,
    ended_at timestamptz
  )`,
  `create index if not exists watch_open on watch_sessions (user_id) where ended_at is null`,
  // Feedback from the app, kept, then forwarded to the team's Discord (feedback.js).
  `create table if not exists feedback (
    id bigserial primary key,
    user_id text not null references users (id),
    message text not null,
    details jsonb,
    reply_to text,
    plan text,
    created_at timestamptz not null,
    forwarded_at timestamptz,
    tries integer not null default 0
  )`,
  `create index if not exists feedback_waiting on feedback (id) where forwarded_at is null`,
  `create index if not exists feedback_recent on feedback (user_id, created_at)`
];

export async function migrate(db) {
  for (const statement of SCHEMA) await db.query(statement);
}
