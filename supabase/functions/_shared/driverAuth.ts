// The driver gate.
//
// Deferred from ticket 2 deliberately: no session could exist until
// driver-verify was built, and speculative middleware nobody can exercise gets
// rewritten rather than reused.
//
// A driver never signs in. They redeem a one-time code for an opaque session
// token, and that token is the credential from then on. Only its hash is
// stored, exactly like the code.
//
// Sessions expire with their trip (PRD D-26): when the run completes or is
// cancelled the session is revoked. There is no timer to tune, and no driver
// logged out mid-journey.

import { errorResponse } from "./errors.ts";

/**
 * The driver's session token travels in its own header, NOT in Authorization.
 *
 * Supabase's Edge Function gateway verifies Authorization as a Supabase JWT
 * before a request reaches our handler, so an opaque token there is rejected
 * upstream with "Invalid JWT" and our own checks never run. Disabling that
 * verification would open the function to unauthenticated traffic, which is
 * worse. So Authorization keeps carrying the publishable key for the gateway,
 * and the session token gets a header of its own.
 */
export const DRIVER_TOKEN_HEADER = "X-Driver-Token";

function driverToken(req: Request): string | null {
  const raw = req.headers.get(DRIVER_TOKEN_HEADER);
  if (!raw) return null;
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

export interface DriverSession {
  tripId: string;
  driverId: string;
  driverName: string;
  status: string;
}

export interface DriverAuthDeps {
  /** Resolve a token hash to its session, or null if unknown or revoked. */
  findSession(tokenHash: string): Promise<DriverSession | null>;
}

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolve the caller to a live driver session, or return the error to send.
 *
 * Terminal trips are refused with their own codes rather than a generic one:
 * "this run was cancelled" and "your session expired" are different things to
 * a driver standing next to a lorry.
 */
export async function requireDriverSession(
  req: Request,
  deps: DriverAuthDeps,
): Promise<DriverSession | Response> {
  const token = driverToken(req);
  // No usable header: return before any lookup, so an unauthenticated request
  // does no work and leaks nothing.
  if (token === null) return errorResponse("unauthorized");

  const session = await deps.findSession(await hashToken(token));
  if (session === null) return errorResponse("session_expired");

  if (session.status === "cancelled") return errorResponse("trip_cancelled");
  if (session.status === "completed") return errorResponse("trip_completed");

  return session;
}
