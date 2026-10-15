// Shared test pieces: a fresh in-memory Postgres (PGlite) with the schema, and signed tokens.
import { PGlite } from '@electric-sql/pglite';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { pgliteDb } from '../src/db.js';
import { migrate } from '../src/schema.js';

export async function freshDb() {
  const db = pgliteDb(new PGlite());
  await migrate(db);
  return db;
}

export async function keys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const keySet = createLocalJWKSet({ keys: [jwk] });
  const sign = (sub, { expiresIn = '5m', key = privateKey } = {}) =>
    new SignJWT({ sid: 's1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);
  return { keySet, sign };
}

export const at = iso => new Date(iso);
