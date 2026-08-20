---
ticket: 11
milestone: M5 Live tracking
labels: android
---

## Story / Why

This is the hardest ticket in the project, and the one everything else quietly depends on. Ticket 13's live map, ticket 12's break detection, and the whole idea of a supervisor knowing where a consignment is all rest on one thing working properly: a phone in a moving vehicle reliably recording where it has been and getting that data to the server.

Android makes this genuinely difficult. The OS stops delivering location the moment the screen sleeps unless you hold a foreground service. Background location permission has to be requested separately, after the fact, with a justification. And several Android manufacturers ship battery managers that kill foreground services anyway, silently, mid-run.

**The manager has decided to keep this as one ticket** rather than splitting it, because the three parts are genuinely coupled — the service can't be tested without permissions and is pointless without the queue, and every acceptance criterion that matters is end-to-end. Accept that it is large. It was scoped as three tickets' work in the original plan and it has not shrunk.

## Context

Read `docs/PRD.md` §5.7, §4.4 (`track_points`), and decisions **D-30, D-31, D-32**. Read the Android section of `CLAUDE.md`, particularly the carve-out that **the location service sits outside MVVM** — it has no ViewModel, no UI, outlives every screen, and takes its dependencies from `AppContainer` directly. Do not give it a ViewModel.

### Why a foreground service, specifically

A driver's screen is off for almost the entire run. Without a foreground service with `foregroundServiceType="location"` and a visible notification, Android stops delivering updates within minutes and the trail simply ends. There is no configuration that avoids this; the service is the mechanism.

### Room first, network second

Every fix is **written to Room before any attempt to send it**, and rows are deleted **only on server acknowledgement**. Not on send — on acknowledgement.

This is not defensive over-engineering. Highway connectivity in India is intermittent by default, and the whole point of this app is knowing where a vehicle went. A design that drops fixes when the network hiccups produces a trail with holes exactly where the interesting parts are.

**Two timestamps, and they are frequently hours apart:**

- `recorded_at` — the device clock, when the fix was taken
- `received_at` — the server clock, when it arrived

Batching means a fix taken in a dead zone at 2pm may arrive at 4pm. **Trails are always ordered by `recorded_at`.** Ordering by arrival would scramble the route into nonsense.

### The permission ladder is a sequence, not a dialog

1. `ACCESS_FINE_LOCATION` at first use, with the reason visible
2. **Then, separately and later, `ACCESS_BACKGROUND_LOCATION`** behind a rationale screen explaining plainly why a delivery app needs location when the screen is off
3. Then the battery-optimisation exemption prompt

Android requires background location to be a distinct, later request — bundling it with foreground location gets it silently denied. The rationale screen is also what a Play reviewer would read, and although **D-30 means we are not submitting for public review**, write it as though someone will: it is what makes the request legible to the driver, who is the person actually granting it.

### OEM battery managers, and why both mechanisms

Xiaomi, Oppo, Vivo and OnePlus in particular kill foreground services aggressively. Per **D-32**, we use two defences because neither is sufficient alone:

- **A battery-optimisation exemption prompt** — which drivers can and do decline
- **A WorkManager watchdog** — a periodic worker that checks whether a service *should* be running and restarts it if it is not

The watchdog is the safety net for the prompt being refused or ignored by the OEM.

### Tracking is trip-scoped, always

The service runs **only while a trip is `active`**. Never before Start, never after completion or cancellation. This is a privacy commitment, it is what the rationale screen promises, and it must be true in code — a service still running after a completed trip is a defect, not an inefficiency.

### Manager's decisions

1. **Distribution: internal testing / direct APK** (D-30, resolving OD-1). No public listing, so no background-location review
2. **Kept as one ticket** — scope it generously
3. **5 s / 10 m at high accuracy**, batched to the server every 15–30 s (D-31)
4. **Exemption prompt *and* WorkManager watchdog** (D-32)

### Environment

No Docker. `driver-track` follows ticket 2's exported-handler pattern. **A real device is mandatory** for this ticket — an emulator cannot reproduce OEM battery behaviour, doze, or actual GPS in motion.

## 🔑 Access & prerequisites

- **A real Android device, API 26+**, ideally one with an aggressive battery manager (Xiaomi, Oppo, Vivo, OnePlus). An emulator is not sufficient for this ticket
- **The ability to take a real trip** — a car, a bus, or a long walk. A trail cannot be validated from a desk
- Supabase credentials, already in `local.properties` from ticket 9
- A `pending` trip you can start, from ticket 7's wizard
- **Confirmation that ticket 10 is merged** — you need a working Start
- Confirmed: **no Play Store submission is required** (D-30), so no demo video or justification document is needed

Nothing new from the manager.

## Scope

**1. `supabase/functions/driver-track/`**

Requires a driver session. Accepts a **batch**: `[{ lat, lng, speedMps, headingDeg, accuracyM, recordedAt }]`.

- Inserts into `track_points`, setting `received_at` server-side
- **Idempotent** — a client retry after a lost response must not duplicate points. Dedupe on `(trip_id, recorded_at)`
- Rejects batches for a trip that is not `active` with `trip_cancelled` or `trip_completed`, so a stale device stops sending
- Returns which fixes were accepted, so the client knows exactly what it may delete

**2. Permission ladder — `ui/permissions/`**

Fine location first, then a rationale screen, then background location, then the battery-optimisation prompt. Each step explains itself. Handle permanent denial by explaining what is lost and offering to open system settings — never a dead end, never a loop.

**3. Foreground service — `service/`**

`foregroundServiceType="location"`, persistent notification showing the run and a way back into the app. `FusedLocationProviderClient` at `Priority.HIGH_ACCURACY`, 5 s interval, 10 m displacement.

Starts on `driver-start`, stops on completion, cancellation, or a `trip_cancelled` response. **Not an MVVM component** — dependencies come from `AppContainer` directly.

**4. Room queue — `data/`**

`track_points` table on-device with a synced flag. Every fix written on arrival. A flush worker sends batches every 15–30 s, deletes only on acknowledgement, and backs off exponentially on failure without ever discarding unsent rows.

**5. WorkManager watchdog**

Periodic worker: if a trip is `active` and the service is not running, restart it. Also flushes any queue backlog.

**6. Tests**

- `deno test`: batch insert; **idempotency on retry**; a non-`active` trip is rejected; `received_at` is server-set; malformed batches are `bad_request`
- JVM/Room tests: fixes persist before sending; rows survive a failed send; rows are deleted only on acknowledgement; ordering by `recorded_at` is preserved across a batch that arrives out of order

## 🖼️ UI standards

This ticket's UI is the rationale screens and the notification — small in surface, high in consequence, since a driver who doesn't understand the request denies it.

### Design fidelity
- [ ] **No design provided — build against the brand kit** and ticket 9's primitives

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] The notification follows system conventions and stays legible in both system themes, since it is drawn by the OS

### Native components
- [ ] Material 3 for the rationale screens; the standard system permission dialogs — **never a fake dialog imitating the OS**
- [ ] Standard notification APIs with a proper channel, named so it is meaningful in system settings

### Layout, insets and responsiveness
- [ ] **Edge-to-edge**; safe areas respected — action buttons must not sit under the gesture bar
- [ ] **Both orientations** (D-28); small through large phone
- [ ] Rationale text wraps and scrolls rather than truncating. **This is the one screen where truncating the explanation is actively harmful**

### Input and keyboard
- [ ] No text input on these screens
- [ ] Every action is a real button, reachable and operable by keyboard and accessibility services

### States and feedback
- [ ] Every permission outcome has a defined state: granted, denied, permanently denied, and partially granted (fine but not background)
- [ ] **Permanent denial explains what stops working and offers system settings** — never a dead end
- [ ] The notification shows meaningful status, not just "running"
- [ ] **A refused battery exemption is not a failure state** — the watchdog covers it; say so calmly
- [ ] State survives rotation and process death
- [ ] Motion subtle; reduce-motion respected

### Accessibility and content
- [ ] Rationale screens are fully readable by a screen reader, in logical order
- [ ] **Font scaling** — the rationale holds at the largest supported size without clipping
- [ ] Touch targets ≥ **48dp**; **WCAG AA contrast**
- [ ] **No hardcoded user-facing strings** — everything through `strings.xml`. The rationale copy is the most important text in the app; keep it in one place and make it plain

### Architecture and verification
- [ ] **The service is outside MVVM** — no ViewModel, dependencies from `AppContainer`
- [ ] No business logic in composables
- [ ] Verified **on a real device, on a real journey**, in both orientations and at the largest font scale

## Acceptance Criteria

- [ ] Tracking continues with **the screen off and the app backgrounded** for a sustained period
- [ ] **Ten minutes in airplane mode loses zero fixes**; all sync when connectivity returns
- [ ] **Force-closing the app mid-run resumes cleanly** from the Room queue with no data loss
- [ ] Rows are deleted **only after server acknowledgement** — a dropped response leaves them queued
- [ ] A client retry after a lost response **creates no duplicate points**
- [ ] The server sets `received_at`; trails query in `recorded_at` order and are correct when fixes arrive late and out of order
- [ ] Background location is requested **separately and after** fine location, behind a rationale screen
- [ ] Permanent denial explains the consequence and offers system settings
- [ ] **Tracking runs only while the trip is `active`** — nothing before Start, nothing after completion or cancellation
- [ ] Killing the service manually results in the **watchdog restarting it** within its period
- [ ] A `trip_cancelled` response from `driver-track` **stops the service**
- [ ] **Verified on at least one aggressive-OEM device** (Xiaomi / Oppo / Vivo / OnePlus), with the result recorded in the handoff
- [ ] **Verified on a real journey of at least 30 minutes**, and the resulting trail inspected for gaps
- [ ] Battery drain over that journey is noted in the handoff — a number, not an impression
- [ ] Every UI standard above is met
- [ ] `deno test` and Room tests pass with no network
- [ ] `git grep` finds no credentials and no user-facing string outside `strings.xml`

## Out of scope

- **The active-run driving screen** — ticket 12. This ticket's UI is permissions and the notification only
- Break-stop arrival detection and timers — ticket 12
- The supervisor's live map — ticket 13. This ticket only produces the data
- Delivery completion — ticket 14
- Location data retention and purging — PRD **OD-3**, still open
- Adaptive sampling by speed — considered and rejected for now (D-31)
- Play Store submission, demo video, background-location justification document — excluded by **D-30**

## Dependencies

**Ticket 10** — a trip that can be started.
**Ticket 9** — Android project, `AppContainer`, session middleware, Room.
**Ticket 1** — the `track_points` table and its `(trip_id, recorded_at)` index.

## References

- `docs/PRD.md` §5.7, §4.4, and D-21, D-28, D-30, D-31, D-32
- `CLAUDE.md` — Android section, especially the service carve-out from MVVM
- [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) · [Background location](https://developer.android.com/develop/sensors-and-location/location/permissions#background) · [FusedLocationProviderClient](https://developer.android.com/develop/sensors-and-location/location/request-updates) · [dontkillmyapp.com](https://dontkillmyapp.com) for OEM-specific behaviour

## Kickoff prompt

```
/start-ticket 11
```

No new credentials. What you do need is **a real device and a real journey** — this ticket cannot be validated from a desk, and an emulator will convince you it works when it does not.

Three things to hold onto. Write to Room before you write to the network, and delete only on acknowledgement. Order by `recorded_at`, never by arrival. And tracking stops the moment a trip is no longer `active` — that is a promise the rationale screen makes to the driver, and it has to be true.

Expect this to take longer than it reads. That is the nature of it, not a failure of estimation.
