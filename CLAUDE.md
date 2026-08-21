# CLAUDE.md — Humble Drive

## What this project is

A two-platform consignment dispatch system. A **supervisor** uses a web dashboard to plan a delivery run — type-ahead source and destination, pick from up to three Google route alternatives, add ordered **driver rest/food/fuel stops** with planned durations, attach one consignment, assign a driver, and email that driver a one-time code. A **driver** enters the code in an Android app, gets the route, is tracked live while driving, records actual break times, and closes the run with a photo at the destination. Built as a teaching/portfolio project — realistic engineering, no commercial compliance. Full spec: **[docs/PRD.md](docs/PRD.md)**; read it before any ticket, and its Decision Log is binding.

## Repo layout

```
web/                  ← Vite + React 18 + TS (strict) + Tailwind. Routes: /login, /drivers, /plan, /trips, /trips/:id
android/              ← Kotlin + Jetpack Compose driver app. Single :app module, layered packages
supabase/
  schema.sql          ← the single source of truth for the DB; migrations in migrations/
  functions/          ← Deno TypeScript edge functions (the entire API surface)
docs/                 ← PRD, PROCESS, briefs, drafted tickets
handoffs/             ← finished-ticket reports
```

## Architecture

**Clients never touch the database.** Every read and write goes through an Edge Function. There are no public RPCs, no anon-key table access, and no third-party API key in any client bundle or APK.

```
Admin web ──JWT──► Edge Functions ──service role──► Postgres
    └──Realtime (authenticated)──► track_points
Android  ──code, then session token──► Edge Functions
                    Edge Functions ──► Google Places · Google Routes · Resend · Storage
```

**Supervisor endpoints** (Supabase Auth JWT, then checked for an active `admins` row): `places-autocomplete` · `routes-preview` · `drivers` · `trips-create` · `trips-resend` · `trips-list` · `trips-detail` · `trips-cancel`.

**Driver endpoints** (code on the first call, then a bearer session token): `driver-verify` · `driver-start` · `driver-track` · `driver-stop-event` · `driver-complete`.

### The rules that go with it

1. **The database is the enforcement layer; the UI is never.** One active run per driver (partial unique index on `driver_id where status in ('pending','active')`), single-use hashed codes, valid state transitions, lowercase driver emails, and `(route_id, seq)` stop ordering are Postgres constraints plus server-side checks. A disabled button is a UX hint, never a guarantee. Any schema change must preserve all of these.

2. **RLS is on with zero permissive policies** on `drivers`, `routes`, `route_stops`, `trips`, `driver_sessions`, `trip_stop_events`, `track_points`. The one exception is the Realtime read feed on `track_points` for the live map, gated by an authenticated supervisor JWT — **never** by the publishable key. Do not add policies, grants, or RPCs without a manager-approved ticket.

3. **No billed third-party key reaches a client.** The server Google key and the Resend key live in Supabase Edge Function secrets. The browser calls our `places-autocomplete` / `routes-preview`; those call Google. A leaked key that can drive Places or Routes is an unbounded liability.
   **One narrow, documented exception: map-rendering keys.** Each client gets its own key that can *only* draw maps, never call a billed-per-request endpoint:
   - **Web** — restricted by HTTP referrer, restricted to the **Maps JavaScript API** alone
   - **Android** — restricted by package name + signing certificate SHA-1, restricted to **Maps SDK for Android** alone

   This exists because drawing an interactive map requires a client-side key, and Google's terms forbid showing Google-derived routes on a non-Google basemap. Never widen either key's API restrictions, and never ship the server key in a client.

4. **Route alternatives are fetched before stops exist.** The Google Routes API returns alternatives *only* when the request has no `intermediates`. So: A→B with `computeAlternativeRoutes: true` → supervisor picks one → stops are added → re-request that corridor with `intermediates` and alternatives off, yielding one refined route. Never request alternatives and waypoints together, and never let the UI imply three routes are still on offer once stops exist.

5. **Intermediate stops are driver breaks, not delivery points.** Nothing is loaded or unloaded at a stop. A stop has a type (`break | food | fuel | other`) and `planned_minutes`. Total run time = drive duration + sum of planned break minutes. Do not add recipients, proof, or parcels to a stop.

6. **Break durations are tracked, never enforced.** The app detects proximity, times the stop, and records actual vs planned. It must not block a driver from resuming early.

7. **Error contract is fixed.** Driver: `invalid_code | code_already_used | trip_cancelled | trip_completed | unauthorized | session_expired | bad_request`. Supervisor: `unauthorized | not_admin | driver_inactive | driver_busy | not_found | invalid_transition | places_failed | routes_failed | email_failed | bad_request`. Platform: `internal_error` (500) for an unhandled failure on our side — never raised deliberately, and the underlying error is logged, never returned. `unauthorized` is checked **first** on every endpoint, before any lookup or third-party call. Both clients must handle every code with friendly plain-English copy. A new code requires updating this list and the PRD.

8. **Booking codes:** 6 chars from `A-Z2-9` minus `O`/`I` (no 0/1 lookalikes — a driver is reading this in a cab), case-insensitive on entry, unique, SHA-256 hashed at rest, single-use. Generated only by `trips-create` / `trips-resend`; a resend overwrites the hash and kills the previous code instantly. **Never log, store, or return a plaintext code** after the sending email is dispatched.

9. **The driver app holds no privileged logic.** It renders what `driver-verify` returned and reports what it observes. It cannot enumerate trips or look up other drivers.

## Key rules

### Frontend (`web/`)
- Stack is locked: Vite + React 18 + TypeScript **strict** + Tailwind. Functional components and hooks only. **No** Redux/MobX, **no** UI kit. `@supabase/supabase-js` for auth and realtime.
- **There is no signup route.** Supervisors are created in the Supabase dashboard with a matching `admins` row. An authenticated user without an active `admins` row is signed out immediately.
- **Responsive is an acceptance criterion**, not a nice-to-have: 375 px, 768 px, 1280 px+. The wizard's map+list layout stacks below 768 px.
- **Theme tokens** (inherited from humblecoders.in, do not invent colors): bg `#07090f` · card `#0f131c` · secondary `#161b27` · muted `#1a2030` · text `#f4f6fb` · muted-text `#94a0b8` · brand `#4263a6` · brand-2 `#5b7cc4` · border `#5b7cc424` · gold `#f5c451` · radius `0.875rem` · Inter (logo script: Caveat). Dark theme only. Defined **once** in `tailwind.config.ts` — never an ad-hoc hex in a component.

### Android (`android/`)
- Kotlin + Jetpack Compose + Maps SDK + Room + **Retrofit/kotlinx.serialization**. minSdk 26, target current stable, **both orientations supported**. **No DI framework** — see manual DI below.
- **Single `:app` module, layered packages: `data/` → `domain/` ← `ui/`, plus `service/`.** Dependencies point one way only: `ui` and `data` may depend on `domain`; `domain` depends on neither. No Android framework types in `domain`.

- **MVVM, strictly.** One ViewModel per screen.
  - **View** — Compose composables only. No business logic, no repository calls, no `suspend` work. They render state and emit events upward.
  - **ViewModel** — exposes a single `StateFlow<UiState>` where `UiState` models loading, empty, error and content **explicitly** (no scattered `isLoading` booleans). Survives rotation. Holds no `Context`, no Compose types, no Android framework imports beyond `ViewModel` itself.
  - **Model** — `domain/` holds plain Kotlin models and use cases with zero Android imports. `data/` holds repositories that are the **only** things touching Room, Retrofit, or `SharedPreferences`. A ViewModel never touches a DAO or an HTTP client directly.
- **Manual dependency injection. No Hilt, no Koin, no annotation processors.**
  - A single `AppContainer`, constructed once in `Application.onCreate()`, owns the long-lived singletons: the Room database, the HTTP client, the token store, and every repository. Dependencies are constructed there and passed down as constructor parameters.
  - ViewModels are created through an explicit `ViewModelProvider.Factory` that takes what it needs from `AppContainer`. Use `viewModel(factory = ...)` in composables — never `hiltViewModel()`, never a ViewModel with a no-arg constructor reaching for a global.
  - `AppContainer` is reachable only via the `Application` instance. No `object` singletons holding state, and no static service locator that any class can call from anywhere — that is the thing manual DI is supposed to avoid, and it is easy to drift into.
  - Every dependency is an **interface** in `domain/` with its implementation in `data/`, so a ViewModel can be unit-tested with a fake and no Android runtime.
- **The location foreground service is outside MVVM.** It has no ViewModel and no UI, outlives every screen, and pulls its dependencies from `AppContainer` directly. Do not give it a ViewModel.
- **Location tracking is a foreground service** with `foregroundServiceType="location"` and a persistent notification. Without it Android stops delivering fixes the moment the screen sleeps — which is most of the run. Tracking runs *only* while a trip is `active`.
- **Every location fix is written to Room first**, then flushed to `driver-track` in batches; rows are deleted only on server acknowledgement. Treat the network as unreliable by default, because on a highway it is.
- `recorded_at` (device clock) and `received_at` (server clock) are both stored and are frequently hours apart. Order trails by `recorded_at`.
- Permission ladder: `ACCESS_FINE_LOCATION` at first use, then `ACCESS_BACKGROUND_LOCATION` as a **separate later request** behind a rationale screen. Prompt for battery-optimisation exemption — OEM battery managers will silently kill the service otherwise.
- Session token in `EncryptedSharedPreferences`. The run payload is cached to Room at verification so the app works with no network from then on.
- Turn-by-turn is delegated to Google Maps via a `google.navigation:` intent. Do not build a navigation engine.
- Theme tokens above, mirrored once in the Compose theme.

### Data & security
- **Driver emails are lowercase, always** — `check (email = lower(btrim(email)))`. Two casings of one address are two driver records for one human, and every per-driver invariant silently breaks. Never insert mixed-case rows by hand.
- **Secrets never enter the repo.** `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL` and the **Supabase secret key** live in Supabase edge-function secrets (`supabase secrets set`). Client config is only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design, still via `.env`, with `.env.example` committed). Android ships only the Supabase URL and publishable key.
- **Key naming follows Supabase's current scheme** (D-39): **publishable** key for clients, **secret** key for server-side. These replace the legacy `anon` / `service_role` JWTs. Use the names the dashboard shows, so nobody has to translate between the docs and the console.
- Delivery photos go to a **private** Storage bucket, served via short-lived signed URLs.
- `trips-create` writes route + stops + trip in **one transaction**. If the email then fails, the trip persists as awaiting-code with a resend action — never leave partial plan state behind.
- Edge functions are Deno TypeScript; keep them dependency-light (`@supabase/supabase-js` only).
- `routes-preview` results are cached briefly server-side and rate-limited per supervisor. Reordering stops must not re-bill an identical Routes API call.

### Conventions
- Copy tone: friendly, plain English, no jargon. Error messages tell the user what to do next.
- Naming: `camelCase` in TS/Kotlin, `snake_case` in SQL and JSON payloads across the API boundary.
- **Tests are required on logic that can silently break**: SQL constraints and state transitions, code generation and hashing, the offline queue flush, and the alternatives/waypoints branching in `routes-preview`. React component tests and Compose UI tests are not required — the handoff documents manual verification instead.
- Branch per ticket: `ticket/<number>-slug` → PR reviewed against acceptance criteria → squash-merge to `main`.

## How we work (ticket workflow)

Process doc: **[docs/PROCESS.md](docs/PROCESS.md)**. Flow: Product Owner `/draft-brief` → dev `/read-brief` + `/draft-ticket` → PO `/review-ticket` → dev `/start-ticket <#>` (plan first, then code) → PR + `/handoff` → manager `/manager-review`. Tickets are GitHub issues; drafted tickets live in `docs/tickets/`, handoff reports in `handoffs/`.

## References

- **Spec:** [docs/PRD.md](docs/PRD.md) — includes the trip state machine, full data model, and the binding Decision Log
- **External systems:** Supabase project (Postgres · Auth · Edge Functions · Realtime · Storage) · Google Maps Platform (Places + Routes, billing enabled — watch quotas) · Resend (needs humblecoders.in verified)
- **Deploy:** `web/` → Vercel on merge to `main`, default Vercel domain (D-37) · edge functions → `supabase functions deploy` (manual) · Android → built from tagged commits, distributed via internal testing / direct APK (D-30)
- **Open decisions still unsettled** (PRD §7): OD-1 Play Store vs internal testing · OD-2 push notifications · OD-3 location retention · OD-4 session lifetime · OD-5 vehicle records
