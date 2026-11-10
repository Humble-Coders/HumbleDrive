// The driver roster.
//
// One rule shapes everything here: a driver is NEVER deleted. Trips reference
// drivers, and a completed run has to keep naming who drove it. Deactivating
// removes them from the assignment picker while preserving every historical
// record — so there is no delete action, not hidden, not conditional.
//
// The other rule worth stating: `driver_busy` is a real check against real
// data, not a disabled button. A driver holding a pending or active trip
// cannot be deactivated, and this endpoint refuses regardless of what the UI
// decided to show (CLAUDE.md rule 1).

import { type AuthDeps, requireAdmin } from "../_shared/auth.ts";
import { errorResponse, jsonResponse } from "../_shared/errors.ts";
import type { Handler } from "../_shared/http.ts";
import { isPlausibleEmail, normaliseEmail, normalisePhone } from "../_shared/normalise.ts";

/** A driver as the client sees them. snake_case on the wire. */
export interface DriverBody {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  /** The run they are on now, if any. Null when free. */
  current_trip: { id: string; status: string; dest_name: string } | null;
}

export interface DriverInput {
  name: string;
  email: string;
  phone: string | null;
}

export interface DriverDeps {
  list(): Promise<DriverBody[]>;
  findByEmail(email: string): Promise<{ id: string } | null>;
  create(input: DriverInput): Promise<DriverBody>;
  get(id: string): Promise<DriverBody | null>;
  update(id: string, input: DriverInput): Promise<DriverBody>;
  setActive(id: string, active: boolean): Promise<DriverBody>;
  /** True when the driver holds a pending or active trip. */
  hasLiveTrip(id: string): Promise<boolean>;
}

type Action =
  | { action: "list" }
  | { action: "create"; name?: unknown; email?: unknown; phone?: unknown }
  | { action: "update"; id?: unknown; name?: unknown; email?: unknown; phone?: unknown }
  | { action: "set_active"; id?: unknown; active?: unknown };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Validate the fields create and update share. Returns the error message, or
 *  the cleaned input. Both actions must agree, so the rules live in one place. */
function readInput(body: { name?: unknown; email?: unknown; phone?: unknown }):
  | { ok: true; value: DriverInput }
  | { ok: false; message: string } {
  const name = str(body.name);
  if (!name) return { ok: false, message: "A driver needs a name." };

  const rawEmail = str(body.email);
  if (!rawEmail) return { ok: false, message: "A driver needs an email address — it's where their code is sent." };

  const email = normaliseEmail(rawEmail);
  if (!isPlausibleEmail(email)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }

  // Phone is optional, but a supplied one must be usable.
  const rawPhone = str(body.phone);
  let phone: string | null = null;
  if (rawPhone) {
    phone = normalisePhone(rawPhone);
    if (phone === null) {
      return { ok: false, message: "That doesn't look like a 10-digit Indian mobile number." };
    }
  }

  return { ok: true, value: { name, email, phone } };
}

export function makeHandler(auth: AuthDeps, db: DriverDeps): Handler {
  return async (req: Request): Promise<Response> => {
    const supervisor = await requireAdmin(req, auth);
    if (supervisor instanceof Response) return supervisor;

    let body: Action;
    try {
      body = (await req.json()) as Action;
    } catch {
      return errorResponse("bad_request", "That request didn't contain valid JSON.");
    }

    switch (body?.action) {
      case "list":
        return jsonResponse({ drivers: await db.list() });

      case "create": {
        const parsed = readInput(body);
        if (!parsed.ok) return errorResponse("bad_request", parsed.message);

        // Checked before insert so the supervisor gets a message that names the
        // problem, rather than a unique-violation surfacing as internal_error.
        const clash = await db.findByEmail(parsed.value.email);
        if (clash) {
          return errorResponse(
            "bad_request",
            "A driver with that email already exists. Search the list for it.",
          );
        }

        return jsonResponse({ driver: await db.create(parsed.value) });
      }

      case "update": {
        const id = str(body.id);
        if (!id) return errorResponse("bad_request", "Which driver?");

        const existing = await db.get(id);
        if (!existing) return errorResponse("not_found");

        const parsed = readInput(body);
        if (!parsed.ok) return errorResponse("bad_request", parsed.message);

        if (parsed.value.email !== existing.email) {
          const clash = await db.findByEmail(parsed.value.email);
          if (clash && clash.id !== id) {
            return errorResponse(
              "bad_request",
              "Another driver already uses that email address.",
            );
          }
        }

        return jsonResponse({ driver: await db.update(id, parsed.value) });
      }

      case "set_active": {
        const id = str(body.id);
        if (!id) return errorResponse("bad_request", "Which driver?");
        if (typeof body.active !== "boolean") {
          return errorResponse("bad_request", "Set active to true or false.");
        }

        const existing = await db.get(id);
        if (!existing) return errorResponse("not_found");

        // The guarantee, not the courtesy. The UI also hides the button, but
        // this is what actually prevents it.
        if (body.active === false && await db.hasLiveTrip(id)) {
          return errorResponse("driver_busy");
        }

        return jsonResponse({ driver: await db.setActive(id, body.active) });
      }

      default:
        return errorResponse("bad_request", "Unknown action.");
    }
  };
}
