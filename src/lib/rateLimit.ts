import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientIp(): string {
  const h = headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

function sweep(now: number) {
  if (buckets.size > 10000) {
    buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) buckets.delete(key);
    });
  }
}

/**
 * Fixed-window in-memory rate limiter keyed by client IP + scope.
 * Returns true when the request is allowed. Suitable for the single-instance
 * deployment; a shared store would be needed if the app scales horizontally.
 */
export function rateLimit(scope: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const key = `${scope}:${clientIp()}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxAttempts;
}

/**
 * Failure-based variant for credential checks (login, PIN): successful
 * attempts never count, so shared IPs (gym Wi-Fi, the kiosk iPad) aren't
 * locked out by normal use. Call `isLockedOut` before checking credentials
 * and `recordFailure` on each failed attempt.
 */
export function isLockedOut(scope: string, maxFailures: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(`${scope}:${clientIp()}`);
  return !!bucket && bucket.resetAt > now && bucket.count >= maxFailures;
}

export function recordFailure(scope: string, windowMs: number): void {
  const now = Date.now();
  sweep(now);
  const key = `${scope}:${clientIp()}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}
