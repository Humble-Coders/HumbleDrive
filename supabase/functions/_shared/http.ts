// Composes CORS, the method check and error handling around a handler, so each
// endpoint's handler.ts contains only its own logic.
//
// Order matters and is fixed (ticket 2, PRD §4.7):
//
//   1. OPTIONS       -> preflight, return immediately
//   2. wrong method  -> bad_request
//   3. run the handler
//
// `unauthorized` is checked inside the handler by requireAdmin, which runs before
// any database work.

import { corsHeaders, preflight } from "./cors.ts";
import { errorResponse } from "./errors.ts";

export interface HttpOptions {
  /** Methods this endpoint accepts. OPTIONS is always handled and need not be listed. */
  methods: readonly string[];
}

export type Handler = (req: Request) => Response | Promise<Response>;

/** Re-issue a response with the CORS headers merged in. Response headers can be
 *  guarded, so rebuild rather than mutate. */
function withCorsHeaders(res: Response, req: Request): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function withHttp(options: HttpOptions, handler: Handler): Handler {
  const methods = options.methods.map((m) => m.toUpperCase());

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return preflight(req, methods);
    }

    // 400 rather than the conventional 405: the error contract is closed and has
    // no code for "wrong method", and inventing one is not ours to do (rule 7).
    if (!methods.includes(req.method.toUpperCase())) {
      return withCorsHeaders(
        errorResponse(
          "bad_request",
          `This endpoint takes ${methods.join(" or ")}, not ${req.method}.`,
        ),
        req,
      );
    }

    try {
      return withCorsHeaders(await handler(req), req);
    } catch (err) {
      // Logged server-side and never returned: an exception message can carry a
      // connection string or a row's contents, and this response is public.
      console.error("Unhandled error in edge function:", err);
      return withCorsHeaders(errorResponse("internal_error"), req);
    }
  };
}
