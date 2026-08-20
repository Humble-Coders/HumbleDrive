---
ticket: 10
milestone: M4 Driver app core
labels: backend,android
---

## Story / Why

Ticket 9 gets a driver into the app and caches their run. This ticket is what they actually look at: the route drawn on a map, the stops they'll be taking, what they're carrying, how long the day is — and a Start button.

It's the screen a driver sees before every run, often in a vehicle, often in sunlight, sometimes with a signal and sometimes not. Its job is to answer one question quickly and honestly: *what am I about to do?*

It's also the last quiet ticket on the Android side. Ticket 11 brings the foreground service and the permission ladder; this one is still a screen that renders cached data and makes one state transition.

## Context

Read `docs/PRD.md` §5.6, §4.5, §4.6 and §4.7, plus the Android section of `CLAUDE.md`. Ticket 9 established the architecture — MVVM, `AppContainer`, Room cache, session token — and this ticket lives inside it without amending it.

### Everything renders from cache

The run payload is already in Room from ticket 9's verification. **This screen must render completely with no network at all.** A driver may verify at a depot on wifi and set off immediately into a dead zone; if the overview needs a request to draw itself, the app fails at the first moment it matters.

Network is used for exactly two things: refreshing stale data when it happens to be available, and starting the trip.

### The map needs its own key

Drawing the route uses **Maps SDK for Android**, which needs a client-side key. That's a third Google key on the project, and the split is deliberate (`CLAUDE.md` rule 3, PRD D-25 and D-29):

| Key | Holder | Can do |
|---|---|---|
| Server key | Edge Functions only | Places + Routes (billed per request) |
| Browser key | Web app | Maps JavaScript API only |
| **Android key** | This app | **Maps SDK for Android only** |

The two client keys can render maps and nothing else. Neither can spend money on Places or Routes. The Android key is restricted by **package name + signing certificate SHA-1**, so you'll need to give the manager your debug SHA-1 to have it added.

Store the key in a **gitignored `local.properties`** and expose it through the manifest via build config. Not committed, not hardcoded.

### Stale cache and who decides

The supervisor can cancel a run at any time (ticket 8). The driver's cached copy knows nothing about that. So:

- **On resume, if there's network, re-fetch** via the new `driver-run` endpoint and update the cache. No network means keep showing the cache — that's not an error state
- **`driver-start` is authoritative.** Whatever the cache says, the server decides. A cancelled trip returns `trip_cancelled` and the app must show that clearly rather than pretending the run began

`driver-run` is a new endpoint, added to PRD §4.6 as part of this ticket. It takes a session token and returns the current run — the same payload shape `driver-verify` returns, minus the token.

### Starting is unconditional

**No location check, no geofence, no proximity requirement.** The driver taps Start when they're ready.

This matters beyond simplicity: gating Start on position would force the location permission ladder into this ticket, and asking for background location before a driver has even begun a run is both premature and confusing. Permissions belong in ticket 11, immediately before the tracking they justify.

`driver-start` moves `pending → active`. Any other starting status is `invalid_transition`.

### Manager's decisions

1. **No design provided** — brand kit and ticket 9's Compose primitives
2. **Manager provisions the Android key**, restricted to Maps SDK for Android by package + SHA-1
3. **Start from anywhere**, no location constraint
4. **Refresh on resume; `driver-start` is authoritative**

### Environment

No Docker, one Supabase project serving as both dev and production. Edge Function halves follow ticket 2's exported-handler pattern, verified with `deno test`, then deployed.

## 🔑 Access & prerequisites

- **`MAPS_API_KEY_ANDROID`** — the manager creates it in the same Google Cloud project, restricted to **Maps SDK for Android** and to the app's package name + signing SHA-1. **Give the manager your debug SHA-1 at kickoff** (`./gradlew signingReport`), or the map renders blank with no obvious error
- Supabase project URL and anon key (already in `local.properties` from ticket 9)
- **A `pending` trip with several stops and a real code**, so the map and stop list have something meaningful to show. Longer routes make truncation and layout problems visible
- A trip you can have the supervisor **cancel while the app is open**, to test the stale path
- **Confirmation that ticket 9 is merged**
- A real device or emulator, API 26+, with Google Play services

## Scope

**1. `supabase/functions/driver-run/`**

New endpoint. Requires a driver session via ticket 9's `requireDriverSession`. Returns the current run payload: route with polyline, ordered stops with type and planned minutes, consignment, driver name, origin and destination, drive duration, break total, total, and current status.

Errors: `unauthorized`, `session_expired`, `trip_cancelled`, `trip_completed`.

**2. `supabase/functions/driver-start/`**

Requires a driver session. `pending → active`, setting `started_at`. Anything else is `invalid_transition`; a cancelled trip returns `trip_cancelled`.

**3. Run overview screen**

Replaces ticket 9's minimal confirmation.

- **Map** with the decoded polyline, origin and destination markers, and numbered stop markers visually distinct from both. Camera framed to the whole route on first show
- **Stop list**, ordered, each showing type (`break | food | fuel | other`) and planned minutes
- **Consignment card**: reference, description, weight if present, receiver name and phone
- **Timing summary**: drive time + break time = total run time, all three visible, not just the total
- **Start button**, prominent and unconditional
- Refresh on resume when network allows; a quiet indicator that data is cached when offline

**4. Repository and ViewModel**

`RunRepository` in `data/`, interface in `domain/`, reading Room first and refreshing opportunistically. One ViewModel exposing a single `StateFlow<UiState>` with explicit loading, content, error and starting states.

**5. Tests**

- `deno test`: `driver-run` and `driver-start` reject a missing or revoked token; `driver-start` from `active`, `completed`, `cancelled` returns the right code; a successful start sets `started_at`
- JVM ViewModel tests with a fake repository: renders from cache with no network; a `trip_cancelled` response surfaces the cancelled state; the Start button disables during the request

## 🖼️ UI standards

Full mobile standards apply.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] **Reuse ticket 9's Compose primitives**; extend them in place rather than forking. Map marker and polyline colours come from theme tokens

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] **A dark map style**, so the map doesn't glare against the app at night or in a dim cab
- [ ] Every colour from a theme token

### Native components
- [ ] Material 3 throughout; the official `MapView`/Compose Maps composable for the map
- [ ] If something can't be done with Material, say so in the PR and use the smallest custom composable that works

### Layout, insets and responsiveness
- [ ] **Edge-to-edge**, background drawing under the system bars
- [ ] **Safe areas respected** — the Start button must not sit under the gesture/navigation bar, and map controls must not hide under the status bar. This is the screen where an inset mistake is most likely, because the button is at the bottom
- [ ] **Both orientations** (D-28). In landscape the map and details sit side by side rather than the map collapsing to a sliver
- [ ] Small phone through large phone
- [ ] **Long place names and consignment descriptions ellipsize cleanly** — Indian addresses are long and this will bite
- [ ] The map keeps a usable minimum height in every configuration

### Input and keyboard
- [ ] No text input on this screen; nothing to handle
- [ ] Receiver phone is **tappable to dial** via a dial intent — a driver needing the receiver should not be copying digits by hand

### States and feedback
- [ ] **Loading, content, error and starting** states explicit in the `UiState`
- [ ] Start disables and shows progress for the whole request; **a double-tap must not start twice**
- [ ] `trip_cancelled` and `trip_completed` render as clear terminal screens explaining what happened and what to do next — never a silent navigation or a raw error
- [ ] **Offline is a normal state, not an error** — the screen renders from cache with a quiet cached indicator
- [ ] **State survives rotation and process death**, which D-28 makes a real path
- [ ] Motion subtle; reduce-motion respected, including camera animation

### Accessibility and content
- [ ] **The map is not the only way to understand the run** — origin, destination, every stop, and all durations are present as text
- [ ] Content descriptions on markers and controls; logical focus order
- [ ] **Font scaling** — layout holds at the largest supported font size, including the timing summary
- [ ] Touch targets ≥ **48dp**; Start comfortably larger, since it's pressed in a vehicle
- [ ] **WCAG AA contrast**, including any text drawn over the map
- [ ] **No hardcoded user-facing strings** — everything through `strings.xml`

### Architecture and verification
- [ ] MVVM per ticket 9; no business logic in composables; no `Context` or Compose types in the ViewModel
- [ ] Dependencies from `AppContainer`; **no global service locator**
- [ ] **The Android maps key is not committed** — `local.properties`, gitignored
- [ ] Verified on smallest and largest device, both orientations, largest font scale, and **in airplane mode**

## Acceptance Criteria

- [ ] **The whole screen renders in airplane mode** from the Room cache — map polyline, stops, consignment, timings
- [ ] The map frames the entire route on first show, with origin, destination and numbered stops distinguishable
- [ ] Timing shows drive + break + total, all three
- [ ] Tapping the receiver's phone number opens the dialler
- [ ] Start works **from any location**, with no permission prompt on this screen
- [ ] A successful start moves the trip to `active` and sets `started_at`
- [ ] **Starting an already-`active`, `completed` or `cancelled` trip returns the correct error** and the UI explains it
- [ ] **Cancelling the trip from the web app, then resuming the phone with network, updates the screen**
- [ ] Cancelling while the phone is offline still fails the Start attempt with `trip_cancelled` once network returns
- [ ] Double-tapping Start produces exactly one transition
- [ ] Rotating the device preserves state in both directions
- [ ] Every UI standard above is met
- [ ] `deno test` passes with no network and no credentials; ViewModel tests run on the JVM
- [ ] `git grep` finds no maps key, no Supabase credentials, and no user-facing string outside `strings.xml`

## Out of scope

- **All location tracking, the foreground service, and the permission ladder** — ticket 11. No location permission is requested on this screen
- The active-run driving screen, break stops, arrival detection — ticket 12
- Delivery completion and photo upload — ticket 14
- Turn-by-turn navigation. Handoff to Google Maps arrives in ticket 12 (PRD D-18)
- Push notification of cancellation — out of v1
- Editing anything about the run. The driver is a consumer of the plan, not an editor

## Dependencies

**Ticket 9** — Android project, `AppContainer`, theme, Room cache, session middleware.
**Ticket 8** — the ability to cancel a trip, needed to test the stale path.
**Ticket 7** — trips with routes and stops.
**Ticket 2** — Edge Function foundation.

## References

- `docs/PRD.md` §5.6, §4.5, §4.6 (including the new `driver-run`), §4.7, and D-18, D-21, D-25, D-28, D-29
- `CLAUDE.md` — Android section, rule 3 (map-rendering key exception), rule 5
- [Maps SDK for Android](https://developers.google.com/maps/documentation/android-sdk) · [Maps Compose](https://github.com/googlemaps/android-maps-compose)

## Kickoff prompt

```
/start-ticket 10
```

At kickoff, **give the manager your debug SHA-1** (`./gradlew signingReport`) so the Android maps key can be restricted to your build — otherwise the map renders blank with no useful error, which is a genuinely confusing hour to lose. Ask for a `pending` trip with several stops.

Two things to hold onto. The screen must work with no network, because that is the situation it exists for. And the server decides whether a run is still real — the cache is a convenience, and `driver-start` is the truth.
