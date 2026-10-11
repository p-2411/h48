import "server-only";

type Window = { count: number; resetAt: number };

/**
 * Fixed-window limiter held in memory. On serverless it limits per warm instance, which stops
 * casual floods; add Vercel Firewall rate limiting or Upstash for a global limit if abuse appears.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, Window>();

  return function take(key: string, now = Date.now()): boolean {
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  };
}

/** The visitor's IP as seen by Vercel's proxy, or a shared bucket when unknown. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
