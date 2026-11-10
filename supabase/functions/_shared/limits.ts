// Rate limiting and caching for the billed Google endpoints.
//
// Injected as dependencies so the handlers can be tested with no database and
// no network — the same discipline ticket 2 used for auth.

export interface LimitDeps {
  /** Increment this supervisor's counter for the current window and return it. */
  bump(userId: string, endpoint: string, windowStart: Date): Promise<number>;
}

export interface CacheDeps {
  read(hash: string, maxAgeSeconds: number): Promise<unknown | null>;
  write(hash: string, response: unknown): Promise<void>;
}

/** Per supervisor, per endpoint. Generous for a human, immediately obvious for
 *  a runaway loop — which is what this is actually for. */
export const RATE_LIMIT_PER_MINUTE = 60;
export const CACHE_TTL_SECONDS = 3600;

export function currentWindow(now: Date = new Date()): Date {
  const w = new Date(now);
  w.setSeconds(0, 0);
  return w;
}

/** Stable hash of the normalised request, so reordering keys cannot miss the
 *  cache and coordinate jitter beyond ~1m cannot silently share one. */
export async function hashRequest(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
