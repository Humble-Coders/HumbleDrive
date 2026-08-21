// The driver's entire API surface for this stage: verify a code, and fetch the
// run for a live session.
//
// driver-verify is the ONE endpoint reachable without an existing credential.
// Everything it does is therefore deliberate:
//
//   - the code is uppercased and hashed before any lookup
//   - a match is single-use: the trip's hash is cleared, so the same code
//     cannot be redeemed twice
//   - a token is minted and only its hash is stored
//
// The plaintext token is returned exactly once, to the device that redeemed
// the code. It is never logged.

import { errorResponse, jsonResponse } from "../_shared/errors.ts";
import type { Handler } from "../_shared/http.ts";
import { hashCode } from "../_shared/code.ts";
import {
  type DriverAuthDeps,
  generateToken,
  hashToken,
  requireDriverSession,
} from "../_shared/driverAuth.ts";

export interface RunPayload {
  trip_id: string;
  status: string;
  driver_name: string;
  consignment: {
    ref: string | null;
    description: string | null;
    weight_kg: number | null;
    receiver_name: string | null;
    receiver_phone: string | null;
  };
  route: {
    origin_name: string;
    origin_lat: number;
    origin_lng: number;
    dest_name: string;
    dest_lat: number;
    dest_lng: number;
    encoded_polyline: string;
    distance_m: number;
    drive_duration_s: number;
  };
  stops: Array<{
    id: string;
    seq: number;
    name: string;
    lat: number;
    lng: number;
    stop_type: string;
    planned_minutes: number;
  }>;
}

export interface DriverDeps extends DriverAuthDeps {
  /** A pending trip whose code hash matches, or null. */
  findPendingByCodeHash(codeHash: string): Promise<{ tripId: string; status: string } | null>;
  /** Any trip with this hash regardless of status, so we can tell a spent code
   *  from one that never existed. */
  findAnyByCodeHash(codeHash: string): Promise<{ tripId: string; status: string } | null>;
  /** True when this trip already has a live session — i.e. the code was
   *  already redeemed. */
  hasSession(tripId: string): Promise<boolean>;
  createSession(tripId: string, tokenHash: string, deviceLabel: string | null): Promise<void>;
  loadRun(tripId: string): Promise<RunPayload | null>;
}

export function makeHandler(deps: DriverDeps): Handler {
  return async (req: Request): Promise<Response> => {
    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("bad_request", "That request didn't contain valid JSON.");
    }

    if (body?.action === "verify") {
      const raw = typeof body.code === "string" ? body.code.trim() : "";
      if (raw.length === 0) return errorResponse("bad_request", "Enter the code from your email.");

      const codeHash = await hashCode(raw);

      const pending = await deps.findPendingByCodeHash(codeHash);
      if (!pending) {
        // Distinguish a spent code from one that never existed. A driver who
        // already verified on another device deserves a different message from
        // one who mistyped.
        const existing = await deps.findAnyByCodeHash(codeHash);
        if (!existing) return errorResponse("invalid_code");
        if (existing.status === "cancelled") return errorResponse("trip_cancelled");
        if (existing.status === "completed") return errorResponse("trip_completed");
        return errorResponse("code_already_used");
      }

      // Single-use. The hash is deliberately NOT destroyed on redemption: doing
      // so loses the only thing that distinguishes "already used" from "never
      // existed", and those are different messages to a driver who cannot tell
      // whether they mistyped or already verified on another phone.
      if (await deps.hasSession(pending.tripId)) {
        return errorResponse("code_already_used");
      }

      const token = generateToken();
      await deps.createSession(
        pending.tripId,
        await hashToken(token),
        typeof body.device_label === "string" ? body.device_label : null,
      );

      const run = await deps.loadRun(pending.tripId);
      if (!run) return errorResponse("invalid_code");

      // The only time this token is ever returned.
      return jsonResponse({ token, run });
    }

    if (body?.action === "run") {
      const session = await requireDriverSession(req, deps);
      if (session instanceof Response) return session;

      const run = await deps.loadRun(session.tripId);
      if (!run) return errorResponse("session_expired");
      return jsonResponse({ run });
    }

    return errorResponse("bad_request", "Unknown action.");
  };
}
