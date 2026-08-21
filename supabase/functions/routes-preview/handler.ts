// Route preview, proxied.
//
// The single most important behaviour in the product lives here:
//
//   no stops  -> computeAlternativeRoutes, up to 3 routes back
//   stops     -> intermediates, exactly 1 route back
//
// They are mutually exclusive in the Routes API. That is not a limitation we
// are working around; the wizard's shape follows from it (PRD §4.3, D-16), and
// the UI's job is to make it legible rather than hide it.
//
// Everything expensive is guarded before Google is called: rate limit, then
// cache, then the request.

import { type AuthDeps, requireAdmin } from "../_shared/auth.ts";
import { errorResponse, jsonResponse } from "../_shared/errors.ts";
import type { Handler } from "../_shared/http.ts";
import {
  computeRoutesRequest,
  type LatLng,
  parseRoutes,
  type RouteOption,
  ROUTES_FIELD_MASK,
  ROUTES_URL,
} from "../_shared/googleAdapters.ts";
import {
  CACHE_TTL_SECONDS,
  type CacheDeps,
  currentWindow,
  hashRequest,
  type LimitDeps,
  RATE_LIMIT_PER_MINUTE,
} from "../_shared/limits.ts";

/** Matches ticket 4's server-side cap; the wizard stops the supervisor before
 *  this, but the guarantee is here. */
export const MAX_STOPS = 10;

export interface RoutesDeps {
  apiKey(): string | null;
  fetch: typeof fetch;
  limits: LimitDeps;
  cache: CacheDeps;
}

interface PreviewBody {
  origin?: unknown;
  destination?: unknown;
  stops?: unknown;
}

function readPoint(value: unknown): LatLng | null {
  if (typeof value !== "object" || value === null) return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export interface PreviewResponse {
  routes: RouteOption[];
  /** True when stops were supplied, so exactly one route came back. The wizard
   *  uses this to explain the collapse rather than silently dropping cards. */
  refined: boolean;
  provider_response: unknown;
}

export function makeHandler(auth: AuthDeps, deps: RoutesDeps): Handler {
  return async (req: Request): Promise<Response> => {
    const supervisor = await requireAdmin(req, auth);
    if (supervisor instanceof Response) return supervisor;

    const key = deps.apiKey();
    if (!key) {
      return errorResponse("routes_failed", "Route planning isn't configured yet.");
    }

    let body: PreviewBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("bad_request", "That request didn't contain valid JSON.");
    }

    const origin = readPoint(body.origin);
    const destination = readPoint(body.destination);
    if (!origin || !destination) {
      return errorResponse("bad_request", "A route needs a start and an end.");
    }

    const rawStops = Array.isArray(body.stops) ? body.stops : [];
    if (rawStops.length > MAX_STOPS) {
      return errorResponse("bad_request", `A run can have at most ${MAX_STOPS} stops.`);
    }
    const stops: LatLng[] = [];
    for (const s of rawStops) {
      const p = readPoint(s);
      if (!p) return errorResponse("bad_request", "One of the stops has no usable location.");
      stops.push(p);
    }

    const used = await deps.limits.bump(supervisor.userId, "routes", currentWindow());
    if (used > RATE_LIMIT_PER_MINUTE) {
      return errorResponse("routes_failed", "Too many route requests at once. Wait a moment and try again.");
    }

    const request = computeRoutesRequest(origin, destination, stops);
    const hash = await hashRequest(request);

    // Reordering stops re-requests on every change, so an identical request
    // inside the window must not bill again.
    const cached = await deps.cache.read(hash, CACHE_TTL_SECONDS);
    if (cached) {
      return jsonResponse({
        routes: parseRoutes(cached),
        refined: stops.length > 0,
        provider_response: cached,
      } satisfies PreviewResponse);
    }

    const res = await deps.fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": ROUTES_FIELD_MASK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    // Includes quota-exceeded, which ticket 4's daily cap makes a genuinely
    // reachable state. It must never surface as an empty success.
    if (!res.ok) return errorResponse("routes_failed");

    const json = await res.json();
    const routes = parseRoutes(json);
    if (routes.length === 0) {
      return errorResponse("routes_failed", "We couldn't find a driveable route between those places.");
    }

    await deps.cache.write(hash, json);

    return jsonResponse({
      routes,
      refined: stops.length > 0,
      provider_response: json,
    } satisfies PreviewResponse);
  };
}
