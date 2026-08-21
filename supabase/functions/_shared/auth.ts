// The supervisor gate. This is the most important file in ticket 2: every
// supervisor endpoint stands behind it, and the function calling it holds the
// Supabase secret key, which bypasses RLS entirely.
//
// Two questions, in this order (CLAUDE.md rule 7, PRD §4.7):
//
//   1. Do I know who you are?    no  -> unauthorized (401)
//   2. Are you a supervisor?     no  -> not_admin    (403)
//
// They are different situations — "I don't know you" versus "I know exactly who
// you are, and you are not staff" — and the web app shows different copy for each.
//
// Both lookups are injected rather than imported. That is not test decoration:
// it keeps this file free of any import from supabase.ts, and therefore free of
// the npm: specifier, which is what lets the suite run with no network at all.

import { errorResponse } from "./errors.ts";

/** The `admins` row for a user. Null means there is no row. */
export interface AdminRecord {
  name: string;
  active: boolean;
}

export interface Supervisor {
  userId: string;
  name: string;
}

export interface AuthDeps {
  /** Verify the caller's JWT and return their user id, or null if it doesn't verify. */
  getUserId(req: Request): Promise<string | null>;
  /** Read the `admins` row for a user id. The only table this ticket touches. */
  getAdmin(userId: string): Promise<AdminRecord | null>;
}

/**
 * Pull the token out of `Authorization: Bearer <token>`.
 * Returns null for a missing header, a different scheme, or an empty token.
 */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve the caller to an active supervisor, or return the error `Response` to
 * send back. Callers narrow with `instanceof Response`.
 *
 * Identity comes from the verified JWT and nowhere else. There is deliberately no
 * code path here that reads a `user_id` from a request body, so ignoring one is
 * not a check that a later endpoint can forget to make.
 */
export async function requireAdmin(
  req: Request,
  deps: AuthDeps,
): Promise<Supervisor | Response> {
  // No usable Authorization header. Return before either dependency is called,
  // so an unauthenticated request does no work and leaks nothing — not even the
  // timing of a lookup.
  if (bearerToken(req) === null) {
    return errorResponse("unauthorized");
  }

  const userId = await deps.getUserId(req);
  if (userId === null) {
    return errorResponse("unauthorized");
  }

  // Known caller. One read, unavoidable: an Auth account is not a supervisor,
  // an active `admins` row is what makes one.
  const admin = await deps.getAdmin(userId);
  if (admin === null || !admin.active) {
    return errorResponse("not_admin");
  }

  return { userId, name: admin.name };
}
