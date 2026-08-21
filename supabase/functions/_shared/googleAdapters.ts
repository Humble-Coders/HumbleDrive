// Everything that knows Google's request and response shapes lives here.
//
// This file is written against the published API contracts WITHOUT having made
// a live call — the key had not arrived when it was built. That matters: the
// tests around it fake `fetch`, so they prove the code is self-consistent, not
// that it matches reality. When the key lands, expect the corrections to be
// here and nowhere else. That containment is the whole reason this file exists
// separately from the handlers.
//
// Everything below normalises at the boundary. No Google-shaped JSON reaches a
// client (CLAUDE.md rule 3's sibling: clients are insulated from the provider).

export const PLACES_HOST = "https://places.googleapis.com/v1";
export const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Runs are India-only (manager's decision, ticket 4). Results outside India
 *  are not returned at all — sharper suggestions, and it caps the damage if
 *  the endpoint is ever abused. */
export const REGION_CODES = ["in"];

/**
 * The Routes field mask.
 *
 * This is a BILLING decision, not a performance one. Google's pricing tier
 * depends on which fields are requested: asking for routes.legs.steps or
 * traffic-aware fields moves the call to a more expensive SKU. Adding a field
 * here can change what every route preview costs, so it is a deliberate,
 * reviewed change — never a convenience.
 */
export const ROUTES_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
  "routes.description",
  "routes.routeLabels",
].join(",");

export interface LatLng {
  lat: number;
  lng: number;
}

/* --------------------------------------------------------------- Places */

export interface Suggestion {
  place_id: string;
  primary_text: string;
  secondary_text: string;
}

export function autocompleteRequest(query: string, sessionToken?: string) {
  return {
    url: `${PLACES_HOST}/places:autocomplete`,
    body: {
      input: query,
      includedRegionCodes: REGION_CODES,
      ...(sessionToken ? { sessionToken } : {}),
    },
  };
}

/** Google nests prediction text three levels deep and any level can be absent. */
// deno-lint-ignore no-explicit-any
export function parseAutocomplete(json: any): Suggestion[] {
  const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
  const out: Suggestion[] = [];

  for (const item of suggestions) {
    const p = item?.placePrediction;
    if (!p?.placeId) continue;
    out.push({
      place_id: p.placeId,
      primary_text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary_text: p.structuredFormat?.secondaryText?.text ?? "",
    });
  }
  return out;
}

/**
 * Place details.
 *
 * Autocomplete returns a placeId but NOT coordinates, and the wizard needs
 * coordinates to draw anything or ask for a route. So a second call is
 * unavoidable — it is not an extra feature, it is what makes a selected
 * suggestion usable. Added as an action on places-autocomplete rather than a
 * new endpoint, to keep the API surface as PRD §4.6 lists it.
 *
 * The field mask is again a billing decision: location and displayName only.
 */
export const PLACE_DETAILS_FIELD_MASK = "id,location,displayName,formattedAddress";

export function placeDetailsUrl(placeId: string, sessionToken?: string): string {
  const q = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  return `${PLACES_HOST}/places/${encodeURIComponent(placeId)}${q}`;
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// deno-lint-ignore no-explicit-any
export function parsePlaceDetails(json: any): PlaceDetails | null {
  const lat = json?.location?.latitude;
  const lng = json?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    place_id: json.id ?? "",
    name: json.displayName?.text ?? json.formattedAddress ?? "",
    address: json.formattedAddress ?? "",
    lat,
    lng,
  };
}

/* --------------------------------------------------------------- Routes */

export interface RouteOption {
  id: string;
  summary: string;
  distance_m: number;
  duration_s: number;
  encoded_polyline: string;
}

function waypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

/**
 * Build a computeRoutes request.
 *
 * THE constraint of this project: the Routes API returns alternatives only when
 * there are no intermediate waypoints. Setting computeAlternativeRoutes
 * alongside intermediates yields exactly one route. So the two are mutually
 * exclusive here, structurally — there is no way to call this function and get
 * both.
 *
 * The wizard is built around this: three alternatives are chosen BEFORE stops
 * exist, then stops refine the chosen corridor (PRD §4.3, D-16).
 */
export function computeRoutesRequest(
  origin: LatLng,
  destination: LatLng,
  stops: LatLng[] = [],
) {
  const hasStops = stops.length > 0;

  return {
    origin: waypoint(origin),
    destination: waypoint(destination),
    // Present only when there are stops; absent entirely otherwise.
    ...(hasStops ? { intermediates: stops.map(waypoint) } : {}),
    // Alternatives only when there are none. Never both.
    ...(hasStops ? {} : { computeAlternativeRoutes: true }),
    travelMode: "DRIVE",
    // TRAFFIC_UNAWARE is the cheaper tier and the honest one: we compute a plan
    // once, at assignment time, and never recalculate an ETA (PRD non-goals).
    routingPreference: "TRAFFIC_UNAWARE",
    // The supervisor's stop order is the stop order (D-22).
    optimizeWaypointOrder: false,
    units: "METRIC",
    languageCode: "en-IN",
  };
}

/** Google returns duration as a string of seconds with a trailing "s". */
export function parseDuration(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const n = Number.parseFloat(value.replace(/s$/, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// deno-lint-ignore no-explicit-any
export function parseRoutes(json: any): RouteOption[] {
  const routes = Array.isArray(json?.routes) ? json.routes : [];

  // deno-lint-ignore no-explicit-any
  return routes.map((r: any, i: number) => ({
    id: String(i),
    summary: r?.description ?? (Array.isArray(r?.routeLabels) ? r.routeLabels.join(", ") : ""),
    distance_m: typeof r?.distanceMeters === "number" ? r.distanceMeters : 0,
    duration_s: parseDuration(r?.duration),
    encoded_polyline: r?.polyline?.encodedPolyline ?? "",
  })).filter((r: RouteOption) => r.encoded_polyline.length > 0);
}
