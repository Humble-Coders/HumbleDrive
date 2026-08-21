// Address search, proxied.
//
// The browser never holds the Google key. It calls this; this calls Google
// (CLAUDE.md rule 3). A key that can drive Places or Routes is an unbounded
// liability, and HTTP-referrer restrictions are trivially spoofable, so there
// is no version of this that runs client-side.
//
// Two actions:
//   suggest  — type-ahead; returns place ids and display text
//   details  — one place id -> coordinates
//
// `details` exists because autocomplete does not return coordinates, and the
// wizard cannot draw or route without them. It is an action here rather than a
// new endpoint so PRD §4.6's surface stays as listed.

import { type AuthDeps, requireAdmin } from "../_shared/auth.ts";
import { errorResponse, jsonResponse } from "../_shared/errors.ts";
import type { Handler } from "../_shared/http.ts";
import {
  autocompleteRequest,
  parseAutocomplete,
  parsePlaceDetails,
  PLACE_DETAILS_FIELD_MASK,
  placeDetailsUrl,
} from "../_shared/googleAdapters.ts";
import { currentWindow, type LimitDeps, RATE_LIMIT_PER_MINUTE } from "../_shared/limits.ts";

export interface PlacesDeps {
  apiKey(): string | null;
  fetch: typeof fetch;
  limits: LimitDeps;
}

export function makeHandler(auth: AuthDeps, deps: PlacesDeps): Handler {
  return async (req: Request): Promise<Response> => {
    const supervisor = await requireAdmin(req, auth);
    if (supervisor instanceof Response) return supervisor;

    // Checked before the call, not after a confusing 403 from Google. A missing
    // key is a deployment mistake and should say so.
    const key = deps.apiKey();
    if (!key) {
      return errorResponse("places_failed", "Address search isn't configured yet.");
    }

    let body: { action?: string; query?: string; place_id?: string; session_token?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse("bad_request", "That request didn't contain valid JSON.");
    }

    const used = await deps.limits.bump(supervisor.userId, "places", currentWindow());
    if (used > RATE_LIMIT_PER_MINUTE) {
      return errorResponse("places_failed", "Too many searches at once. Wait a moment and try again.");
    }

    const sessionToken = typeof body.session_token === "string" ? body.session_token : undefined;

    if (body.action === "details") {
      const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
      if (!placeId) return errorResponse("bad_request", "Which place?");

      const res = await deps.fetch(placeDetailsUrl(placeId, sessionToken), {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK },
      });
      if (!res.ok) return errorResponse("places_failed");

      const details = parsePlaceDetails(await res.json());
      if (!details) return errorResponse("places_failed", "That place has no location we can use.");
      return jsonResponse({ place: details });
    }

    // Default action: suggest.
    const query = typeof body.query === "string" ? body.query.trim() : "";
    // Debouncing is the client's job; this just refuses to bill for noise.
    if (query.length < 2) return jsonResponse({ suggestions: [] });

    const { url, body: payload } = autocompleteRequest(query, sessionToken);
    const res = await deps.fetch(url, {
      method: "POST",
      headers: { "X-Goog-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return errorResponse("places_failed");

    return jsonResponse({ suggestions: parseAutocomplete(await res.json()) });
  };
}
