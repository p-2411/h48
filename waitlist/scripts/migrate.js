// Creates the waitlist table in Neon. The endpoint also creates it on first use; run this to set
// it up ahead of time or to check a connection string.
// Run:  DATABASE_URL=postgres://… npm run migrate
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Set DATABASE_URL (or POSTGRES_URL) to your Neon connection string.');
  process.exit(1);
}
const sql = neon(url);
await sql`
  create table if not exists waitlist_signups (
    id bigserial primary key,
    email text not null,
    email_normalized text not null unique,
    source text,
    created_at timestamptz not null default now()
  )`;
const [{ count }] = await sql`select count(*)::int as count from waitlist_signups`;
console.log(`waitlist_signups is ready (${count} sign-ups).`);
