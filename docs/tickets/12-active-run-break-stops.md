---
ticket: 12
milestone: M5 Live tracking
labels: backend,android
---

## Story / Why

Ticket 11 made the phone record where it goes. This ticket gives the driver something to look at while it does — the screen they glance at between stretches of road.

Its job is narrow and specific: show where they are on the route, what's next and how far, get them into navigation with one tap, and quietly handle break stops as they reach them. It's the screen that has to be readable at a glance, in sunlight, mounted on a dashboard, by someone whose attention belongs on the road.

It also records the data ticket 13 needs to show planned break time against actual.

## Context

Read `docs/PRD.md` §5.6, §4.4 (`trip_stop_events`) and decisions **D-3, D-8, D-18**. Read ticket 11 — this ticket consumes its location stream and must not fight it.

### Breaks are tracked, never enforced

**D-8 is the rule here and it is easy to violate by accident.** The app detects arrival, times the stop, and shows elapsed against planned. It must **never** block a driver from resuming, never nag, never require a minimum. A driver who takes four minutes of a planned thirty leaves after four minutes, and the app records four minutes without comment.

The supervisor sees planned versus actual in ticket 13. That visibility is the entire mechanism — not enforcement in the app.

And per **D-3**: these are rest, food and fuel stops. Nothing is loaded or unloaded. There is no recipient at a stop and no proof to capture.

### Arrival detection rides the existing stream

Ticket 11's service already produces a fix every 5 seconds. **Check distance to the next unvisited stop on each fix**; within roughly 100 m, prompt.

No Geofencing API. It would duplicate a stream we already have, bring its own permission and reliability quirks, and OEM battery managers treat geofences worse than foreground services. The simpler mechanism is also the more reliable one here.

**Arrival is advisory.** The app prompts; the driver confirms. It never auto-completes a stop, because a driver passing a service station on the highway at 90 km/h is not taking a break there.

### Skipping is implicit

**No Skip button.** If a driver decides not to take a break, they drive on. No arrival is confirmed, no stop event is recorded, and ticket 13 shows the stop as not taken.

This falls straight out of D-8: if breaks aren't enforced, not taking one needs no ceremony. It also means no schema change — an absent `trip_stop_events` row *is* the skip.

### Offline is the normal case

Stop events queue in Room and sync exactly like location fixes — written locally first, deleted only on server acknowledgement. A driver confirming arrival in a dead zone must see the timer start immediately. Nothing on this screen may wait on a network round trip.

### Navigation is a handoff, not a feature

**D-18: we do not build navigation.** One tap opens Google Maps with a `google.navigation:` intent to **the next unvisited stop**, or the destination if none remain.

Next-stop-only is deliberate: it matches where the driver actually is, and it avoids the waypoint limits of a multi-stop maps URL. When they come back to the app, tracking has continued the whole time — ticket 11's service is independent of which app is in front.

### Cancellation reaches the driver here

If the supervisor cancels mid-run (ticket 8), `driver-track` starts returning `trip_cancelled`. This screen is where that becomes visible: tracking stops, the service stops, and the driver gets a clear terminal state explaining the run was cancelled. Not a silent navigation, not a crash.

### Manager's decisions

1. **No design provided** — brand kit and ticket 9/10 primitives
2. **Distance check on the existing fix stream**, no Geofencing API
3. **Implicit skipping**, no Skip button, no schema change
4. **Navigate to the next stop only**

### Environment

No Docker. `driver-stop-event` follows ticket 2's exported-handler pattern. **A real device and a real journey are required** to validate arrival detection, exactly as in ticket 11.

## 🔑 Access & prerequisites

- **A real Android device, API 26+**, and the ability to take a real trip
- **A trip with at least two break stops at places you can actually drive to** — arrival detection cannot be validated from a desk. Ask the manager to create one, or create it yourself through the wizard using nearby locations
- A trip you can have the supervisor **cancel mid-run**, to verify the cancellation path
- Supabase credentials, already in `local.properties`
- **Confirmation that ticket 11 is merged** — this ticket consumes its location stream

Nothing new from the manager.

## Scope

**1. `supabase/functions/driver-stop-event/`**

Requires a driver session. Records arrival at, or departure from, a break stop.

- `arrive` sets `arrived_at`; `resume` sets `resumed_at`
- **Idempotent** — a retry after a lost response must not create a duplicate or overwrite an earlier timestamp. `trip_stop_events` is unique on `(trip_id, route_stop_id)` from ticket 1
- Rejects events for a trip that is not `active` with `trip_cancelled` or `trip_completed`
- Out-of-order or nonsensical events (resume before arrive, unknown stop) are `bad_request`

**2. Active run screen**

Replaces the overview once the trip is `active`.

- **Live position on the route**, following the driver, with the polyline and remaining stops
- **Next stop card**: name, type, planned minutes, distance remaining. Or the destination when no stops remain
- **Navigate button** → `google.navigation:` intent to the next stop
- **Arrival prompt** when within ~100 m, requiring confirmation
- **Break timer** once arrived: elapsed against planned, counting up past the planned figure without alarm
- **Resume button**, always enabled — no minimum, no confirmation
- **Progress**: stops completed, distance and time remaining
- Cancellation renders as a clear terminal state

**3. Repository and ViewModel**

Stop events queue in Room and sync with the same acknowledge-then-delete discipline as ticket 11. One ViewModel exposing a single `StateFlow<UiState>` covering driving, near-stop, on-break, cancelled and completed.

**4. Tests**

- `deno test`: arrive and resume recorded; **idempotency on retry**; non-`active` trips rejected; resume-before-arrive is `bad_request`
- JVM tests: distance calculation triggers at the right threshold; the timer counts from `arrived_at`, not from when the UI mounted; events persist offline and sync on reconnect; a `trip_cancelled` response drives the cancelled state

## 🖼️ UI standards

Full mobile standards apply. **This screen is read at a glance while driving**, which raises the bar on legibility above every other screen in the project.

### Design fidelity
- [ ] **No design provided — build against the brand kit** and existing primitives

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] **Dark map style**, as in ticket 10 — a bright map at night in a cab is genuinely dangerous
- [ ] Every colour from a theme token

### Native components
- [ ] Material 3 throughout; the official Maps composable
- [ ] If something can't be done with Material, say so in the PR and use the smallest custom composable that works

### Layout, insets and responsiveness
- [ ] **Edge-to-edge**; **safe areas respected** — Navigate and Resume must never sit under the gesture bar, since they are pressed without looking carefully
- [ ] **Both orientations** (D-28). Landscape is likely on a dashboard mount: map and next-stop card side by side, not a collapsed sliver
- [ ] Small through large phone
- [ ] **Long stop names ellipsize cleanly** and never push the distance or the button off-screen

### Input and keyboard
- [ ] No text input on this screen
- [ ] **Primary actions are large and comfortably spaced** — meaningfully bigger than the 48dp minimum, because they are pressed in a moving vehicle
- [ ] Consider keeping the screen awake while the trip is active; if you do, make it obvious and stop on completion

### States and feedback
- [ ] **Driving, near-stop, on-break, cancelled and completed** are explicit states in the `UiState`
- [ ] **The break timer counts from `arrived_at`**, so it stays correct across rotation, backgrounding, and process death
- [ ] Elapsed time past planned is shown **calmly** — informative, not an alarm. D-8 means overrunning is not an error
- [ ] **Resume is never disabled**, never gated on a minimum, never confirmed
- [ ] Offline is normal: arrival and resume register instantly and sync later, with a quiet pending indicator
- [ ] Cancellation is a clear terminal screen explaining what happened
- [ ] Motion subtle; reduce-motion respected, including map camera movement

### Accessibility and content
- [ ] **The map is not the only way to understand progress** — next stop, distance and timer are all text
- [ ] Content descriptions on all controls; logical focus order
- [ ] **Font scaling** — the next-stop card and timer hold at the largest supported size
- [ ] **WCAG AA contrast**, including text over the map, checked in daylight conditions
- [ ] **No hardcoded user-facing strings** — everything through `strings.xml`

### Architecture and verification
- [ ] MVVM; **no business logic in composables**; the ViewModel holds no `Context` or Compose types
- [ ] The screen **observes** ticket 11's service; it does not own or restart it
- [ ] Verified **on a real device on a real journey**, in both orientations and at the largest font scale

## Acceptance Criteria

- [ ] Live position follows the driver along the route, with remaining stops visible
- [ ] Next stop shows name, type, planned minutes and distance remaining; the destination takes over when no stops remain
- [ ] Navigate opens Google Maps to the **next unvisited stop**, and tracking continues while Maps is in front
- [ ] Arrival prompts within ~100 m and **requires confirmation** — no stop is ever auto-completed
- [ ] **Driving past a stop without confirming leaves it unvisited**, with no nagging and no block on continuing
- [ ] The break timer starts from `arrived_at` and remains correct after rotation, backgrounding and process death
- [ ] **Resume works at any time**, including immediately after arrival, with no minimum
- [ ] Elapsed time beyond planned displays calmly and is recorded accurately
- [ ] Stop events created offline persist and sync on reconnect; a retry creates **no duplicate**
- [ ] Resume before arrive returns `bad_request`
- [ ] **Supervisor cancellation mid-run stops tracking, stops the service, and shows a clear terminal state**
- [ ] Every UI standard above is met
- [ ] `deno test` and JVM tests pass with no network
- [ ] **Verified on a real journey** past at least two stops, with the recorded times checked against reality
- [ ] `git grep` finds no credentials and no user-facing string outside `strings.xml`

## Out of scope

- **Delivery completion and the photo** — ticket 14. This ticket ends with the driver at the destination and nothing to tap
- The supervisor's view of any of this — ticket 13
- Turn-by-turn inside our app — excluded by D-18
- Multi-waypoint navigation handoff — next stop only
- A Skip button, and any schema change for skipping
- Re-ordering or editing stops mid-run. The driver consumes the plan; they do not edit it
- Push notification of cancellation — PRD **OD-2**, still open

## Dependencies

**Ticket 11** — the location stream, the foreground service, and the offline queue pattern this reuses.
**Ticket 10** — a started trip and the map component.
**Ticket 8** — supervisor cancellation, needed to test that path.
**Ticket 1** — `trip_stop_events` and its unique constraint.

## References

- `docs/PRD.md` §5.6, §4.4, and D-3, D-8, D-18, D-21, D-28
- `CLAUDE.md` — rules 5 and 6, Android section
- Ticket 11 for the fix stream and the acknowledge-then-delete queue

## Kickoff prompt

```
/start-ticket 12
```

No new credentials. You need **a real device, a real journey, and a trip with at least two stops you can actually drive to** — arrival detection cannot be validated from a desk.

Two things to hold onto. Resume is never blocked, never gated, never confirmed: breaks are recorded, not enforced, and the supervisor's visibility in ticket 13 is the whole mechanism. And arrival is a prompt, never an automatic completion — a driver doing 90 past a service station has not stopped there.
