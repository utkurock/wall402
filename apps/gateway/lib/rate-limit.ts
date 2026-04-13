/**
 * Simple in-memory rate limiter.
 * Tracks requests per IP/key within a sliding window.
 */

const globalForRL = globalThis as unknown as {
  __wall402RateLimit?: Map<string, number[]>;
};
const store =
  globalForRL.__wall402RateLimit ??
  (globalForRL.__wall402RateLimit = new Map<string, number[]>());

export function rateLimit(
  key: string,
  opts: { windowMs?: number; max?: number } = {},
): { ok: boolean; remaining: number } {
  const windowMs = opts.windowMs ?? 60_000; // 1 minute
  const max = opts.max ?? 30; // 30 req/min default
  const now = Date.now();

  let timestamps = store.get(key) ?? [];
  // Prune old entries
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    store.set(key, timestamps);
    return { ok: false, remaining: 0 };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { ok: true, remaining: max - timestamps.length };
}

/** Extract client IP from request headers */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
