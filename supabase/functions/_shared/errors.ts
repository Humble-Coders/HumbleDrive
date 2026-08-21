// The error contract from PRD §4.7. It is fixed and closed: adding a code here
// means updating the PRD and CLAUDE.md rule 7 in the same change, because both
// clients have to render every code with copy a driver or supervisor can act on.
//
// The typing does the enforcing twice, and it is worth being precise about which
// two things, because a later ticket will trust this without re-testing it:
//
//   - An invented string is not assignable to MappedErrorCode, so it cannot be
//     passed to errorResponse().
//   - A supervisor or platform code added to the union without a status breaks
//     ERROR_STATUS's exhaustiveness, and removing a status breaks DEFAULT_MESSAGE.
//
// Driver codes are deliberately outside that map until ticket 9 gives them
// statuses alongside the endpoints that raise them. Everything above fails
// `deno check` rather than review.

/** Returned to the supervisor web app. */
export type SupervisorErrorCode =
  | "unauthorized"
  | "not_admin"
  | "driver_inactive"
  | "driver_busy"
  | "not_found"
  | "invalid_transition"
  | "places_failed"
  | "routes_failed"
  | "email_failed"
  | "bad_request";

/** Returned to the Android driver app. Endpoints land in ticket 9; the
 *  vocabulary is declared here so the closed set lives in exactly one file. */
export type DriverErrorCode =
  | "invalid_code"
  | "code_already_used"
  | "trip_cancelled"
  | "trip_completed"
  | "unauthorized"
  | "session_expired"
  | "bad_request";

/** Not caller-facing in origin: something broke on our side. Every other code
 *  blames the caller or a named third party, so an unhandled exception had
 *  nowhere to go. Added to PRD §4.7 by ticket 2. */
export type PlatformErrorCode = "internal_error";

export type ErrorCode = SupervisorErrorCode | DriverErrorCode | PlatformErrorCode;

/** HTTP status per code.
 *
 *  The `satisfies` target is exhaustive over supervisor and platform codes on
 *  purpose: adding one without a status must not compile. It excludes driver
 *  codes, which ticket 9 maps alongside the endpoints that raise them —
 *  assigning statuses to codes nothing emits yet would be guessing. */
export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  not_admin: 403,
  not_found: 404,
  driver_inactive: 409,
  driver_busy: 409,
  invalid_transition: 409,
  internal_error: 500,
  places_failed: 502,
  routes_failed: 502,
  email_failed: 502,
} as const satisfies Record<SupervisorErrorCode | PlatformErrorCode, number>;

/** The codes this ticket can actually return. */
export type MappedErrorCode = keyof typeof ERROR_STATUS;

/** Plain English, and each one says what to do next (CLAUDE.md, Conventions). */
export const DEFAULT_MESSAGE: Record<MappedErrorCode, string> = {
  bad_request: "That request didn't look right. Please check it and try again.",
  unauthorized: "Please sign in again to continue.",
  not_admin: "This account isn't set up for Humble Drive. Ask your manager to add it.",
  not_found: "We couldn't find that. It may have been removed.",
  driver_inactive: "That driver is inactive. Reactivate them, or choose someone else.",
  driver_busy: "That driver is already on a run. Choose another driver, or wait until they finish.",
  invalid_transition: "This run has already moved on. Refresh to see where it is now.",
  internal_error: "Something went wrong on our side. Please try again in a moment.",
  places_failed: "We couldn't reach the address lookup just now. Please try again in a moment.",
  routes_failed: "We couldn't work out a route just now. Please try again in a moment.",
  email_failed: "The run was saved, but the code didn't send. Use Resend to try again.",
};

/** Every error body is exactly these two fields — no wrapper, no extras. */
export interface ErrorBody {
  error: MappedErrorCode;
  message: string;
}

/**
 * Build an error response. `message` overrides the default when an endpoint can
 * say something more specific; the code and status never vary.
 */
export function errorResponse(
  code: MappedErrorCode,
  message: string = DEFAULT_MESSAGE[code],
  headers: HeadersInit = {},
): Response {
  const body: ErrorBody = { error: code, message };
  return new Response(JSON.stringify(body), {
    status: ERROR_STATUS[code],
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** Success payloads go back bare — no { ok: true } for every client to unwrap. */
export function jsonResponse(payload: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
