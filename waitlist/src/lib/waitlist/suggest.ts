/**
 * Typo help for email addresses ("Did you mean sam@gmail.com?").
 *
 * Pure and dependency-free so it runs on every blur. It only ever suggests:
 * the caller shows the suggestion and the visitor decides (brief §2.7).
 */

/** Popular inboxes for Australian visitors, most common first. Ties go to the earlier entry. */
export const POPULAR_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "yahoo.com",
  "bigpond.com",
  "bigpond.net.au",
  "optusnet.com.au",
  "live.com.au",
  "outlook.com.au",
  "yahoo.com.au",
] as const;

/**
 * Real domains that sit close to a popular one (for example ymail.com is one
 * edit from gmail.com). We never "correct" these.
 */
const KNOWN_DOMAINS = new Set<string>([
  ...POPULAR_DOMAINS,
  "aapt.net.au",
  "aol.com",
  "dodo.com.au",
  "email.com",
  "fastmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "hey.com",
  "hotmail.co.uk",
  "iinet.net.au",
  "internode.on.net",
  "iprimus.com.au",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.co.nz",
  "ozemail.com.au",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "tpg.com.au",
  "westnet.com.au",
  "xtra.co.nz",
  "y7mail.com",
  // Regional inboxes of the popular providers: a different country, not a typo.
  "hotmail.ca",
  "yahoo.ca",
  "yahoo.co.in",
  "yahoo.co.jp",
  "yahoo.co.nz",
  "yahoo.co.uk",
  "yahoo.com.hk",
  "yahoo.com.my",
  "yahoo.com.ph",
  "yahoo.com.sg",
  "yahoo.com.tw",
  "yahoo.com.vn",
  "ymail.com",
  "zoho.com",
]);

/** Whole-domain fixes that are too far apart for the edit-distance check. */
const DOMAIN_FIXES: Record<string, string> = {
  "gmail.com.au": "gmail.com",
  "icloud.com.au": "icloud.com",
};

/** Common slips at the end of a domain. Longer suffixes first so ".com.ua" wins over ".ua". */
const TLD_FIXES: [bad: string, good: string][] = [
  [".com.ua", ".com.au"],
  [".net.ua", ".net.au"],
  [".org.ua", ".org.au"],
  [".con.au", ".com.au"],
  [".cmo.au", ".com.au"],
  [".comau", ".com.au"],
  [".netau", ".net.au"],
  [".com.a", ".com.au"],
  [".net.a", ".net.au"],
  [".comm", ".com"],
  [".coom", ".com"],
  [".con", ".com"],
  [".cpm", ".com"],
  [".cmo", ".com"],
  [".ocm", ".com"],
  [".vom", ".com"],
  [".xom", ".com"],
  [".c0m", ".com"],
  [".cm", ".com"],
  [".nte", ".net"],
  [".ner", ".net"],
];

/** Popular domains first, so a tie goes to the more likely inbox. */
const CANDIDATES: readonly string[] = [
  ...POPULAR_DOMAINS,
  ...[...KNOWN_DOMAINS].filter((d) => !(POPULAR_DOMAINS as readonly string[]).includes(d)),
];

const MAX_LENGTH = 254;

/** The part before the first dot: "gmail" for "gmail.com". */
function nameOf(domain: string): string {
  return domain.split(".")[0];
}

/**
 * Whether `value` is close enough to `candidate` to suggest it. Names of 4 characters
 * or fewer get one edit, so "abc.com" is not turned into "aol.com". Names of 3 or fewer
 * must match exactly, because one letter changes a short name into a different real
 * domain ("ge.com", "ms.com" are not typos of "me.com"); the edit must be in the ending.
 */
function withinReach(value: string, candidate: string, distance: number): boolean {
  const name = nameOf(candidate);
  if (name.length <= 3 && nameOf(value) !== name) return false;
  return distance <= (name.length <= 4 ? 1 : 2);
}

/**
 * Damerau–Levenshtein distance (optimal string alignment): the number of
 * insertions, deletions, substitutions and swaps of two neighbouring
 * characters needed to turn `a` into `b`.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Three rolling rows: two back (for swaps), previous and current.
  let twoBack = new Array<number>(n + 1).fill(0);
  let previous = Array.from({ length: n + 1 }, (_, j) => j);
  let current = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    current[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, twoBack[j - 2] + 1);
      }
      current[j] = best;
    }
    [twoBack, previous, current] = [previous, current, twoBack];
  }
  return previous[n];
}

/** The candidate with the fewest edits, within each candidate's allowance, or null. */
function closest(value: string, candidates: readonly string[], key: (candidate: string) => string = (c) => c): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = damerauLevenshtein(value, key(candidate));
    if (distance < bestDistance && withinReach(value, candidate, distance)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Commas for dots, no doubled, leading or trailing dots. */
function tidy(domain: string): string {
  return domain.replace(/,/g, ".").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
}

function fixDomain(domain: string): string {
  if (KNOWN_DOMAINS.has(domain)) return domain;
  if (DOMAIN_FIXES[domain]) return DOMAIN_FIXES[domain];

  // No dot at all ("sam@gmail"): match on the name part of the popular domains.
  if (!domain.includes(".")) return closest(domain, POPULAR_DOMAINS, nameOf) ?? domain;

  const near = closest(domain, CANDIDATES);
  if (near) return near;

  // "optusnet.com" → "optusnet.com.au"
  const withAu = `${domain}.au`;
  if ((POPULAR_DOMAINS as readonly string[]).includes(withAu)) return withAu;

  for (const [bad, good] of TLD_FIXES) {
    if (domain.endsWith(bad) && domain.length > bad.length) {
      const fixed = `${domain.slice(0, -bad.length)}${good}`;
      // "gmail.con.au" → "gmail.com.au" → "gmail.com"
      return DOMAIN_FIXES[fixed] ?? closest(fixed, CANDIDATES) ?? fixed;
    }
  }

  return domain;
}

/**
 * Returns the address with a likely domain typo fixed, or null when the
 * domain looks fine or the input is not shaped like an email at all.
 * The part before the @ is kept exactly as typed.
 */
export function suggestEmail(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) return null;

  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  const typedDomain = trimmed.slice(at + 1).toLowerCase();
  if (local.includes("@") || /\s/.test(local) || /\s/.test(typedDomain)) return null;

  const domain = tidy(typedDomain);
  if (domain.length === 0) return null;

  const fixed = fixDomain(domain);
  return fixed === typedDomain ? null : `${local}@${fixed}`;
}
