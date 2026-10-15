// The database as one call: query(text, params) gives the rows. Neon in production (over HTTP, one
// statement per call, so every change that must be atomic is a single statement); PGlite, an
// in-memory Postgres, in the tests.
import { neon } from '@neondatabase/serverless';

export function neonDb(url) {
  const sql = neon(url);
  return { query: (text, params = []) => sql.query(text, params) };
}

export function pgliteDb(pg) {
  return { query: async (text, params = []) => (await pg.query(text, params)).rows };
}

let shared;
/** The production database, from DATABASE_URL (or POSTGRES_URL, as the Neon integration sets it). */
export function database(env = process.env) {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  shared ??= neonDb(url);
  return shared;
}
