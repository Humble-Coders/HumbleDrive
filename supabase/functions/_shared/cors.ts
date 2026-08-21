// CORS is an env-driven allowlist, never `*` (manager's call, ticket 2).
//
// ALLOWED_ORIGINS is a comma-separated list set with `supabase secrets set`.
// An origin that is not on it gets no Access-Control-Allow-Origin header at
// all — not a rejection message, just nothing, which is what the browser needs
// to see to block the response.

/** Request headers the browser is allowed to send us. */
const ALLOWED_HEADERS = "authorization, content-type, apikey, x-client-info";

const MAX_AGE_SECONDS = "86400";

/**
 * Read the allowlist. Read per call rather than at module load so tests can set
 * it, and so a secret change takes effect on the next request.
 *
 * An unset or empty variable allows nothing. Failing closed is deliberate: a
 * forgotten secret should break the web app loudly in dev, not quietly allow
 * every origin in production.
 */
export function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

export function isAllowedOrigin(origin: string | null): boolean {
  return origin !== null && allowedOrigins().includes(origin);
}

/**
 * Headers to attach to every response, success or error.
 *
 * `Vary: Origin` is always present, including when the origin is refused: without
 * it a cache could serve an allowed origin's response — CORS header and all — to
 * an origin we just turned down.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = { "Vary": "Origin" };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}

/** Preflight: 204, no body, advertising the methods this endpoint actually takes. */
export function preflight(req: Request, methods: readonly string[]): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": MAX_AGE_SECONDS,
    },
  });
}
