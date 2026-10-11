// POST /api/join — adds an email to the Duet waitlist.
//
// Body (JSON): { email, source, website }. `source` says which form it came from (dock, closing).
// `website` is a hidden field people never see; bots fill it in, and those requests are accepted
// silently and dropped. Replies: { ok: true, already: boolean } or { ok: false, error }.
//
// Storage: Neon Postgres when DATABASE_URL (or POSTGRES_URL) is set — the Neon integration on
// Vercel sets it. Running locally without one, sign-ups go to .data/signups.json instead, so the
// page can be tried end to end. On Vercel without a database the endpoint refuses rather than
// losing sign-ups.
import { neon } from '@neondatabase/serverless';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCES = new Set(['dock', 'closing', 'hero']);
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
// Next to the project (waitlist/.data), wherever the dev server was started from; ignored by git.
const LOCAL_FILE = fileURLToPath(new URL('../.data/signups.json', import.meta.url));

let tableReady = null;
const ensureTable = sql => {
  // Runs once per cold start; the table and its unique index make sign-ups idempotent.
  tableReady ??= sql`
    create table if not exists waitlist_signups (
      id bigserial primary key,
      email text not null,
      email_normalized text not null unique,
      source text,
      created_at timestamptz not null default now()
    )`.catch(error => { tableReady = null; throw error; });
  return tableReady;
};

const saveToDatabase = async (email, normalized, source) => {
  const sql = neon(DATABASE_URL);
  await ensureTable(sql);
  const rows = await sql`
    insert into waitlist_signups (email, email_normalized, source)
    values (${email}, ${normalized}, ${source})
    on conflict (email_normalized) do nothing
    returning id`;
  return { already: rows.length === 0 };
};

const saveToFile = async (email, normalized, source) => {
  let list = [];
  try { list = JSON.parse(await readFile(LOCAL_FILE, 'utf8')); } catch { /* First sign-up. */ }
  if (list.some(entry => entry.email_normalized === normalized)) return { already: true };
  list.push({ email, email_normalized: normalized, source, created_at: new Date().toISOString() });
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(list, null, 2));
  return { already: false };
};

const readBody = async req => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('Body too large');
  }
  return JSON.parse(raw || '{}');
};

const reply = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { ok: false, error: 'method' });
  }
  let body;
  try { body = await readBody(req); } catch { return reply(res, 400, { ok: false, error: 'body' }); }

  if (typeof body.website === 'string' && body.website.trim()) return reply(res, 200, { ok: true, already: false });

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > 254 || !EMAIL.test(email)) return reply(res, 400, { ok: false, error: 'email' });
  const normalized = email.toLowerCase();
  const source = SOURCES.has(body.source) ? body.source : null;

  if (!DATABASE_URL && process.env.VERCEL) {
    console.error('join: no DATABASE_URL on Vercel; refusing so no sign-up is lost');
    return reply(res, 503, { ok: false, error: 'storage' });
  }
  try {
    const result = DATABASE_URL ? await saveToDatabase(email, normalized, source) : await saveToFile(email, normalized, source);
    return reply(res, 200, { ok: true, already: result.already });
  } catch (error) {
    console.error('join: could not save sign-up', error);
    return reply(res, 500, { ok: false, error: 'storage' });
  }
}
