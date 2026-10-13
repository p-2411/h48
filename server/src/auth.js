// Checks the WorkOS access token the app sends as `Authorization: Bearer <token>`: the signature
// against WorkOS's public keys for Duet's client id, and the expiry. The token's subject is the
// user id. The token is never logged.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './errors.js';

const unauthorised = () => new HttpError(401, 'auth', 'Sign in to Duet again.');

/** A token check against `keySet` (a jose key set). */
export function verifier(keySet) {
  return async header => {
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorised();
    try {
      const { payload } = await jwtVerify(token, keySet);
      if (typeof payload.sub !== 'string' || !payload.sub) throw unauthorised();
      return payload.sub;
    } catch {
      throw unauthorised();
    }
  };
}

/** WorkOS's key set for the client id (the same URL WorkOS's own SDKs use). */
export function workosKeySet(clientId) {
  return createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
}
