// Trips: create, resend, list, detail, cancel.
//
// One function rather than five, because they share validation and shapes and
// there is no local `functions serve` — five deploys per change is a real cost
// with no local loop to absorb it. The action names match PRD §4.6's endpoint
// names so the surface is still legible.
//
// Two things this file guards:
//
//   The code is a credential. It is generated, hashed, and handed to the email
//   once. code_hash is never returned by any action, not for debugging, not
//   behind a flag. A supervisor who is asked "what was the code?" resends.
//
//   The trip is written BEFORE the email is sent. If Resend fails, the trip
//   still exists as pending and the dashboard offers a resend — the supervisor
//   loses an email, not three minutes of planning.

import { type AuthDeps, requireAdmin } from "../_shared/auth.ts";
import { errorResponse, jsonResponse } from "../_shared/errors.ts";
import type { Handler } from "../_shared/http.ts";
import { generateCode, hashCode } from "../_shared/code.ts";
import { type EmailDeps, sendCode } from "../_shared/email.ts";

export const PAGE_SIZE = 10;

export interface CreateInput {
  route: Record<string, unknown>;
  stops: Array<Record<string, unknown>>;
  driver_id: string;
  consignment: Record<string, unknown>;
}

export interface TripsDeps {
  createTrip(input: CreateInput, createdBy: string, codeHash: string): Promise<string>;
  driverEmail(driverId: string): Promise<string | null>;
  markCodeSent(tripId: string): Promise<void>;
  /** Overwrites the hash, which kills the previous code instantly. */
  replaceCode(tripId: string, codeHash: string): Promise<void>;
  tripStatus(tripId: string): Promise<string | null>;
  tripDriverEmail(tripId: string): Promise<string | null>;
  list(filter: { status?: string[]; driverId?: string; limit: number; offset: number }): Promise<
    { trips: unknown[]; total: number }
  >;
  detail(tripId: string): Promise<unknown | null>;
  cancel(tripId: string, reason: string | null, by: string): Promise<void>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export function makeHandler(auth: AuthDeps, db: TripsDeps, email: EmailDeps): Handler {
  return async (req: Request): Promise<Response> => {
    const supervisor = await requireAdmin(req, auth);
    if (supervisor instanceof Response) return supervisor;

    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse("bad_request", "That request didn't contain valid JSON.");
    }

    switch (body?.action) {
      case "create": {
        const driverId = str(body.driver_id);
        if (!driverId) return errorResponse("bad_request", "Choose a driver for this run.");
        if (!body.route) return errorResponse("bad_request", "This run has no route.");

        const code = generateCode();
        const codeHash = await hashCode(code);

        let tripId: string;
        try {
          tripId = await db.createTrip(
            {
              route: body.route,
              stops: Array.isArray(body.stops) ? body.stops : [],
              driver_id: driverId,
              consignment: body.consignment ?? {},
            },
            supervisor.userId,
            codeHash,
          );
        } catch (err) {
          // The Postgres function raises these by name; anything else is a bug
          // and becomes internal_error via withHttp.
          const message = err instanceof Error ? err.message : "";
          if (message.includes("driver_busy")) return errorResponse("driver_busy");
          if (message.includes("driver_inactive")) return errorResponse("driver_inactive");
          if (message.includes("driver_not_found")) return errorResponse("not_found");
          throw err;
        }

        // Trip exists from here on. An email failure cannot undo it.
        const to = await db.driverEmail(driverId);
        const result = to ? await sendCode(email, to, code) : { sent: false };
        if (result.sent) await db.markCodeSent(tripId);

        return jsonResponse({ trip_id: tripId, code_sent: result.sent });
      }

      case "resend": {
        const tripId = str(body.trip_id);
        if (!tripId) return errorResponse("bad_request", "Which run?");

        const status = await db.tripStatus(tripId);
        if (status === null) return errorResponse("not_found");
        // Only a run nobody has started can have its code reissued.
        if (status !== "pending") return errorResponse("invalid_transition");

        const code = generateCode();
        await db.replaceCode(tripId, await hashCode(code));

        const to = await db.tripDriverEmail(tripId);
        const result = to ? await sendCode(email, to, code) : { sent: false };
        if (result.sent) await db.markCodeSent(tripId);

        return jsonResponse({ code_sent: result.sent });
      }

      case "list": {
        const status = Array.isArray(body.status)
          ? body.status.filter((s: unknown) => typeof s === "string")
          : undefined;
        const limit = Number.isInteger(body.limit) ? Math.min(body.limit, 50) : PAGE_SIZE;
        const offset = Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;

        return jsonResponse(
          await db.list({ status, driverId: str(body.driver_id) ?? undefined, limit, offset }),
        );
      }

      case "detail": {
        const tripId = str(body.trip_id);
        if (!tripId) return errorResponse("bad_request", "Which run?");
        const trip = await db.detail(tripId);
        if (!trip) return errorResponse("not_found");
        return jsonResponse({ trip });
      }

      case "cancel": {
        const tripId = str(body.trip_id);
        if (!tripId) return errorResponse("bad_request", "Which run?");

        const status = await db.tripStatus(tripId);
        if (status === null) return errorResponse("not_found");
        if (status !== "pending" && status !== "active") {
          return errorResponse("invalid_transition");
        }

        const reason = str(body.reason);
        // Cancelling an ACTIVE trip stops a driver who is currently on the
        // road. That deserves an explanation; cancelling a pending one is just
        // an administrative correction.
        if (status === "active" && !reason) {
          return errorResponse("bad_request", "Say why this run is being stopped — the driver is on the road.");
        }

        await db.cancel(tripId, reason, supervisor.userId);
        return jsonResponse({ status: "cancelled" });
      }

      default:
        return errorResponse("bad_request", "Unknown action.");
    }
  };
}
