---
ticket: 4
milestone: M2 Route planning
labels: backend
---

## Story / Why

The planning wizard needs two things from Google: address suggestions as the supervisor types, and real routes with real durations between the places they pick. This ticket builds both as Edge Functions, so the browser never holds the API key.

That last point is the reason this is a backend ticket rather than a frontend one. **The Google Maps key is attached to billing.** A key shipped in a JavaScript bundle is a public key, HTTP-referrer restrictions are trivially spoofable, and the failure mode is a bill rather than an outage. `CLAUDE.md` rule 3 states this has no exceptions, and this is the ticket where that rule becomes real code.

It's also where the single most important behavioural constraint in the product gets proven, before any UI is built on top of an assumption that turns out to be false.

## Context

Read `docs/PRD.md` §4.3 and §5.3, and `CLAUDE.md` rules 3 and 4.

### The constraint that shapes everything

> **The Google Routes API returns alternative routes only when the request has no intermediate waypoints.** Setting `computeAlternativeRoutes: true` alongside `intermediates` yields exactly one route. This is documented Google behaviour, not a bug to work around.

So `routes-preview` has **two distinct modes**, and which one runs depends purely on whether `stops` is empty:

| Request | Mode | Returns |
|---|---|---|
| origin + destination, no stops | `computeAlternativeRoutes: true` | up to 3 routes |
| origin + destination + stops | `intermediates` set, alternatives **off** | exactly 1 route |

Never send both. Ticket 6's UI is built directly on this — the supervisor picks among three routes *first*, then adds stops to refine the chosen one. If you find yourself trying to return three routes with stops attached, re-read this section; the product flow exists in that order because of this constraint.

### Billing is a design input, not an afterthought

Three things drive Routes API cost, and you control all three:

1. **The field mask.** `X-Goog-FieldMask` is required, and *what you ask for determines which pricing tier you're billed at*. Requesting `routes.legs.steps` or traffic-aware fields moves you to a more expensive SKU. Ask for exactly: `routes.duration`, `routes.distanceMeters`, `routes.polyline.encodedPolyline`, `routes.description`, `routes.routeLabels`. Nothing else, unless a later ticket needs it and says so.
2. **Repeat calls.** Wizard step 3 re-requests the route on **every** stop edit — add, remove, reorder. Without caching, a supervisor fiddling with stop order for two minutes bills a dozen identical requests.
3. **Session tokens on autocomplete.** Places bills per-request without one and per-session with one. The client generates a token per search session and passes it through; you forward it.

### Manager's decisions, and why

- **Places API (New) + Routes API**, provisioned by the manager on their Google Cloud billing account. Not the legacy Places/Directions APIs — those are on a deprecation path and Routes gives better alternative-route data.
- **India only, hard restriction.** `includedRegionCodes: ["in"]` — results outside India are not returned at all. Sharper suggestions, and it limits the damage if the endpoint is ever abused.
- **Postgres-backed cache and rate limiting.** Edge Functions are ephemeral and horizontally scaled, so an in-memory cache would have a near-random hit rate and an in-memory rate limit would be unenforceable. Both need to be in the database. This ticket therefore carries a migration.
- **A hard daily quota cap on the key**, set by the manager in Google Cloud, plus a budget alert. This is the guardrail that actually works: requests past the cap fail instead of billing. The app must degrade honestly when that happens — `routes_failed` with copy that says the service is unavailable, never a silent empty result.

**A note on key restriction.** Edge Functions call out from Supabase's infrastructure with IPs that are not stable, so IP allowlisting the key is not practical. Restrict the key **by API** (Places + Routes only) and rely on the quota cap. Say this in the README so nobody later assumes the key is IP-locked.

### Environment

No Docker, one Supabase project serving as both dev and production. `supabase functions serve` is unavailable, so the loop is `deno test` locally and `supabase functions deploy` for the real check. Every function keeps the exported-handler shape from ticket 2. **Fake `fetch` in tests** — the suite must never call Google, both because it costs money and because tests that need network are tests nobody runs.

## 🔑 Access & prerequisites

Request from the manager over a secure channel. **The key never enters the repo, a commit, this issue, or any client bundle.**

- **`GOOGLE_MAPS_API_KEY`** — a server-side key with **Places API (New)** and **Routes API** enabled, restricted to those two APIs
- **Written confirmation that a daily quota cap and budget alert are set** before you make a single live call
- Supabase project credentials and the supervisor login from tickets 1–3
- Supabase CLI linked; Deno installed

```bash
supabase secrets set GOOGLE_MAPS_API_KEY="..."
```

## Scope

**1. Migration — two small tables**

Add a migration and update `schema.sql` to match. RLS on, zero policies, same as everything else.

- **`routes_cache`** — `request_hash text primary key`, `response jsonb not null`, `created_at timestamptz not null default now()`. Hash is a SHA-256 of the normalised request (origin, destination, ordered stops, mode). Entries older than the TTL are ignored on read and deleted opportunistically.
- **`api_rate_limits`** — `user_id uuid`, `endpoint text`, `window_start timestamptz`, `count int`, primary key `(user_id, endpoint, window_start)`. Fixed-window counting is fine here; we are protecting a budget, not defending against a determined attacker.

**2. `supabase/functions/places-autocomplete/`**

`POST` with `{ query, sessionToken? }`. Requires a supervisor (`requireAdmin` from ticket 2).

Calls Places API (New) autocomplete with `includedRegionCodes: ["in"]`, forwarding the session token when present. Returns a **normalised** shape — `[{ placeId, primaryText, secondaryText }]` — not raw Google JSON. Both clients should be insulated from Google's response format.

Debounce is the client's job (ticket 6), not this endpoint's.

**3. `supabase/functions/routes-preview/`**

`POST` with `{ origin: {lat, lng}, destination: {lat, lng}, stops?: [{lat, lng}] }`. Requires a supervisor.

- Validates input. Missing or malformed coordinates → `bad_request`. Cap `stops` at 10 and reject beyond that with `bad_request`
- Branches on `stops` per the table above
- `optimizeWaypointOrder` is **false** — the supervisor's stop order is the stop order (PRD D-22)
- Checks `routes_cache` before calling Google; writes the response to cache after
- Increments and checks `api_rate_limits` before doing any work
- Returns normalised routes: `[{ id, summary, distanceM, durationS, encodedPolyline }]`, plus the raw Google response under `providerResponse` so ticket 7 can persist it to `routes.provider_response`
- Any non-2xx from Google, including a quota-exceeded response, becomes `routes_failed`

**4. Tests — `deno test`**

Fake `fetch` throughout. Cover: no-stops sends `computeAlternativeRoutes` and no `intermediates`; with-stops sends `intermediates` and no alternatives; waypoint order preserved; field mask is exactly the agreed list; cache hit avoids the fetch entirely; rate limit returns the right error once exceeded; a Google 4xx/5xx maps to `routes_failed`; a Places failure maps to `places_failed`; both endpoints reject a non-supervisor.

**5. Documentation**

README: which APIs to enable, how to set the secret, that the key is API-restricted but **not** IP-restricted and therefore relies on the quota cap, the field mask and why it must stay minimal, and the cache TTL.

## Acceptance Criteria

- [ ] A request **without** stops sends `computeAlternativeRoutes: true` and **no** `intermediates`, and returns up to 3 routes
- [ ] A request **with** stops sends `intermediates` and **does not** set `computeAlternativeRoutes`, and returns exactly 1 route
- [ ] Stop order in the request matches the order supplied; `optimizeWaypointOrder` is false
- [ ] `X-Goog-FieldMask` contains exactly the five agreed fields and nothing more
- [ ] `includedRegionCodes: ["in"]` is sent on every autocomplete request
- [ ] A Places session token, when supplied, is forwarded unchanged
- [ ] An identical repeat request inside the TTL is served from `routes_cache` and makes **zero** outbound calls — proven by a fake `fetch` that fails the test if called
- [ ] Exceeding the per-supervisor rate limit returns an error without calling Google
- [ ] A Google error or quota-exceeded response surfaces as `routes_failed` / `places_failed`, never as an empty success
- [ ] Both endpoints return `unauthorized` with no JWT and `not_admin` for a non-supervisor
- [ ] Malformed coordinates, and more than 10 stops, return `bad_request`
- [ ] Responses are normalised; no raw Google JSON reaches the client except the explicit `providerResponse` field
- [ ] `deno test` passes with **no network access** and no API key present
- [ ] Both functions deployed and verified against the real APIs with a genuine India address
- [ ] `git grep` finds no API key anywhere in the repo, and nothing in `web/` references a Google endpoint
- [ ] Migration applied; `schema.sql` updated to match; RLS on with zero policies on both new tables
- [ ] README documents the quota cap, the field mask, and the absence of IP restriction

## Out of scope

- Any wizard UI — ticket 6
- Persisting routes or stops to `routes` / `route_stops` — ticket 7
- Turn-by-turn or step-level directions. The field mask deliberately excludes them; the driver app hands off to Google Maps (PRD D-18)
- Waypoint optimisation — excluded by D-22
- Distance-matrix, geocoding, or any third Google API

## Dependencies

**Ticket 2** must be merged — both endpoints use `requireAdmin`, the error helpers, and the CORS module.
**Ticket 1** for the schema this migration extends.

## References

- `docs/PRD.md` §4.3 (the alternatives constraint), §5.3 (wizard steps), §4.7 (error codes)
- `CLAUDE.md` — rules 3 and 4
- [Routes API — compute routes](https://developers.google.com/maps/documentation/routes/compute_route_directions)
- [Routes API — field masks and billing](https://developers.google.com/maps/documentation/routes/choose_fields)
- [Places API (New) — autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)

## Kickoff prompt

```
/start-ticket 4
```

At kickoff, ask the manager for `GOOGLE_MAPS_API_KEY` over a secure channel and get **written confirmation that the daily quota cap and budget alert are already in place** before making any live call.

Two things to hold onto: alternatives and waypoints are mutually exclusive, and every field you add to the field mask can change what Google charges you. Prove both with tests before you deploy anything.
