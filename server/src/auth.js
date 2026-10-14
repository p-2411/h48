// Checks the WorkOS access token the app sends as `Authorization: Bearer <token>`: the signature
// against WorkOS's public keys for Duet's client id, and the expiry. The token's subject is the
// user id. The token is never logged.
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { HttpError } from './errors.js';

const unauthorised = () => new HttpError(401, 'auth', 'Sign in to Duet again.');

/** A token check against `keySet` (a jose key set). */
export function verifier(keySet) {
  return async header => {
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorised();
    let payload;
    try {
      ({ payload } = await jwtVerify(token, keySet));
    } catch (error) {
      // WorkOS's keys out of reach (a network failure, a timeout, a bad reply) is the server's
      // trouble, not the sign-in's: a 401 would show the learner as signed out.
      if (!(error instanceof errors.JOSEError) || error.code === 'ERR_JWKS_TIMEOUT' || error.code === 'ERR_JOSE_GENERIC')
        throw new HttpError(503, 'auth_unavailable', 'Could not check the sign-in. Try again.');
      throw unauthorised();
    }
    if (typeof payload.sub !== 'string' || !payload.sub) throw unauthorised();
    return payload.sub;
  };
}

/** WorkOS's key set for the client id (the same URL WorkOS's own SDKs use). */
export function workosKeySet(clientId) {
  return createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
}
