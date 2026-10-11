import { createHash, randomBytes } from "node:crypto";

// Crockford base32: no I, L, O or U, so codes are easy to read aloud and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A short, human-friendly code used in invite links (?ref=CODE). Public, so it never authorises anything. */
export function createReferralCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % 32];
  return code;
}

/**
 * A one-time secret returned to the browser after the email step. Only its hash is stored,
 * so the details step can prove it comes from the same visitor without accounts or cookies.
 */
export function createEditToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** SHA-256 of the lowercased email, matching encode(sha256(convert_to(lower(email),'UTF8')),'hex') in SQL. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * One-way hash of the visitor's IP for the consent record. Salted so the stored value can't be
 * reversed with a lookup table; set IP_HASH_SALT in production to keep hashes stable across deploys.
 */
export function hashIp(ip: string, salt = process.env.IP_HASH_SALT ?? "roofless-dev-salt"): string | undefined {
  if (!ip || ip === "unknown") return undefined;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
