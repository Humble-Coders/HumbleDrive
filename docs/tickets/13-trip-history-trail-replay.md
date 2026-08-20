---
ticket: 13
milestone: M5 Live tracking
labels: backend,web
---

## Story / Why

The driver app has been recording everything since ticket 11 — where the vehicle went, when it stopped, how long each break actually took — and none of it is visible to anyone. Ticket 8 left a labelled placeholder on the trip detail page for exactly this.

This ticket fills it: the recorded trail drawn over the planned route, and each break stop showing planned minutes against what actually happened. It's the payoff for the whole tracking pipeline, and it's what makes a completed run reviewable rather than merely finished.

## Context

Read `docs/PRD.md` §5.4, §4.4 and decisions **D-33, D-34**, plus `CLAUDE.md` rules 1 and 2. Ticket 8 built the trip detail page this extends.

### The live map is cut from v1 — read this before you start

**D-33: there is no real-time supervisor map.** The manager cut it. Trails are reviewed after the fact, refreshed when the page loads, not pushed live.

Three consequences, all of which simplify this ticket:

1. **No Supabase Realtime.** No subscription, no channel, no `@supabase/supabase-js` realtime import.
2. **No RLS policy. Anywhere.** Rule 2 used to carry a single carve-out for the live feed; that carve-out is gone, and the rule is now absolute. **`pg_policies` must return zero rows for our schema** — that is an acceptance criterion, and it is stronger than what tickets 1 to 12 had to satisfy.
3. All data reaches the browser through `trips-detail`, exactly like everything else.

The driver app keeps recording everything regardless, so live viewing can be added later without touching the data model. It just isn't v1.

### Trails are ordered by `recorded_at`, always

`track_points` carries two timestamps and they are frequently hours apart: `recorded_at` is the device clock when the fix was taken, `received_at` is the server clock when it arrived. Ticket 11's offline queue means a fix taken in a dead zone at 2pm can arrive at 4pm, after fixes taken at 3pm.

**Order by `recorded_at`.** Ordering by arrival draws a trail that jumps backwards and forwards across the map — and it will look almost right on a short test run with good signal, which is what makes it a dangerous mistake.

### Trails are downsampled server-side

A six-hour run at 5-second intervals is roughly 4,000 points; longer runs are worse. `trips-detail` returns **at most ~500 points**, thinned evenly or by Douglas–Peucker. The drawn line looks identical at map zoom levels, the payload stays small, and it does not degrade as runs get longer.

Downsample in SQL or in the function — not in the browser. Sending 20,000 points to thin them client-side defeats the purpose.

### Planned versus actual is the point

For each stop: planned minutes from `route_stops`, actual from `trip_stop_events` (`resumed_at - arrived_at`). Three cases, all normal:

- **Taken** — both timestamps present. Show actual against planned, with overruns and undershoots both marked
- **In progress** — arrived, not yet resumed. Show elapsed so far
- **Not taken** — no event row at all. Per ticket 12, skipping is implicit: the driver simply drove on

**Not taken is not a failure.** D-8 makes breaks advisory, so present it as information, not as a red flag. The supervisor is being informed, not handed a stick.

### Retention

**D-34, resolving OD-3: `track_points` live 90 days, then a scheduled purge** deletes older rows. The trip, its stop events, and its summary survive — only the fine-grained trail expires.

This ticket adds the purge job and a summary the trip keeps permanently: total distance travelled, and first and last fix times. That way a two-year-old trip still says something true after its trail is gone.

### Manager's decisions

1. **No design provided** — brand kit and the primitives from tickets 3, 6 and 8
2. **No live map** (D-33) — no Realtime, no RLS policy
3. **Server-side downsampling**, capped at ~500 points
4. **90-day retention with a purge job** (D-34)

### Environment

No Docker, one Supabase project serving as both dev and production. The purge job is destructive by design — see the prerequisites.

## 🔑 Access & prerequisites

- Supabase credentials and a supervisor login (tickets 1–3)
- **`VITE_GOOGLE_MAPS_BROWSER_KEY`**, already in `.env` from ticket 6
- **A completed trip with a real recorded trail** — ideally the 30-minute journey from ticket 11's verification. A trail from a desk-bound test tells you nothing about how the line looks
- **A trip with a break stop that was actually taken**, and one where a stop was driven past, so both cases render
- **Confirmation that tickets 11 and 12 are merged** — without them there is no data
- **Before testing the purge job**, take a `pg_dump`. There is one database and it is also production; a mis-scoped delete has no undo

## Scope

**1. Migration**

- Add trip-level summary columns retained beyond the trail: `distance_travelled_m`, `first_fix_at`, `last_fix_at`
- Add the **purge function** deleting `track_points` older than 90 days, scheduled with `pg_cron`. **Scope it by age only** — never by trip, never by driver
- Update `schema.sql`; RLS stays on with zero policies

**2. `trips-detail` — extended**

Adds to ticket 8's payload:

- The recorded trail, **ordered by `recorded_at`, downsampled to ~500 points**
- Per-stop actuals: `arrived_at`, `resumed_at`, computed actual minutes, and a taken / in-progress / not-taken state
- The trip summary columns
- A flag indicating the trail was purged, so the UI can say so rather than showing an empty map

**3. Trip detail — the tracking panel**

Replaces ticket 8's placeholder.

- **Recorded trail drawn over the planned route**, visually distinct — planned recessive, actual prominent
- Start and end markers for the trail
- **Break stops with planned versus actual**, each in its correct state, overruns and undershoots both marked without alarm
- Trip summary: distance travelled, first and last fix, total elapsed
- A clear message when a trail has been purged, or when a trip has no trail because it never started

**4. Strings**

Copy for the three stop states, the purged-trail message, and the no-trail-yet case.

**5. Tests**

`deno test` with a faked database: ordering is by `recorded_at` and correct when fixes arrive out of order; downsampling caps the count and keeps first and last points; the three stop states compute correctly; a purged trail sets the flag. Plus a SQL test that the purge deletes only rows older than 90 days and touches nothing else.

## 🖼️ UI standards

Adapted for web and this project. Mobile-only items (notch, home indicator, Android gesture bar) dropped as inapplicable.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] **Reuse the map component from ticket 6 and the detail layout from ticket 8.** Extend in place; do not fork

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Planned and actual routes are distinguishable **by more than colour alone** — weight, opacity or dash pattern too, so the distinction survives a colour-blind viewer
- [ ] Every colour from a token, including stop-state indicators

### Native components
- [ ] Semantic HTML for the stop table and summary; real `<button>` for any control
- [ ] If something can't be done natively, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **375 px, 768 px, 1280 px+** correct; map and panels stack below 768 px with a usable map height
- [ ] No horizontal scrollbar at any width
- [ ] **Long stop names and place names ellipsize cleanly** in the comparison table

### Input and keyboard
- [ ] Any map controls are keyboard-reachable
- [ ] No text input on this view

### States and feedback
- [ ] **Loading, error, and three distinct empty states**: trip not started (no trail yet), trail purged after 90 days, and trip started but no fixes received. These mean different things and must read differently
- [ ] **A not-taken break is neutral information, not an error state** — D-8 makes breaks advisory
- [ ] Trail loading shows progress; a long trail must not block the rest of the page from rendering
- [ ] Visible hover and focus feedback; `prefers-reduced-motion` respected

### Accessibility and content
- [ ] **The map is not the only way to read the outcome** — distance, timings, and every planned-versus-actual figure are present as text
- [ ] The stop table has proper headers and scope; states are announced as text, not inferred from colour
- [ ] Visible focus rings; touch targets ~44 px; **WCAG AA contrast**, including both route lines against the dark map
- [ ] Survives 200% browser zoom
- [ ] **No user-facing string literals outside `src/strings.ts`**

### Architecture and verification
- [ ] No business logic in presentational components
- [ ] **No Supabase Realtime import anywhere** (D-33)
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] The recorded trail renders over the planned route and the two are clearly distinguishable
- [ ] **The trail is ordered by `recorded_at`** and is correct when fixes arrived late and out of order — verified with deliberately out-of-order data
- [ ] A trail of 4,000+ points is downsampled to ~500 server-side, with first and last points preserved
- [ ] The browser never receives the full unthinned trail
- [ ] Each break stop shows planned versus actual in the right state: taken, in progress, or not taken
- [ ] **A not-taken stop reads as neutral information**, not a failure
- [ ] Overruns and undershoots are both marked, calmly
- [ ] Trip summary shows distance travelled, first and last fix, and total elapsed
- [ ] The three empty states are distinguishable and correctly worded
- [ ] **The purge deletes only `track_points` older than 90 days** and leaves trips, stop events and summaries intact — proven by a SQL test
- [ ] A trip whose trail has been purged still shows its summary and a clear explanation
- [ ] **`pg_policies` returns zero rows for our schema** — rule 2 is now absolute
- [ ] **No Realtime subscription exists anywhere in the codebase**
- [ ] Every UI standard above is met
- [ ] `deno test` and SQL tests pass
- [ ] Migration applied and `schema.sql` updated

## Out of scope

- **The live supervisor map, Realtime, and any RLS policy** — cut by D-33. Do not build a polling substitute either; that is the same feature by another route
- Delivery photo display — ticket 14
- Animated playback of the trail over time. A static line is what this ticket delivers
- Export, reporting, analytics, or per-driver aggregates
- Speed, harsh-braking, or driver-behaviour analysis
- Push notifications — PRD **OD-2**, still open

## Dependencies

**Ticket 12** — `trip_stop_events` with real arrival and resume times.
**Ticket 11** — `track_points` with real trails.
**Ticket 8** — the trip detail page and its placeholder.
**Ticket 6** — the map component.

## References

- `docs/PRD.md` §5.4, §4.4, and D-8, D-21, D-33, D-34
- `CLAUDE.md` — rules 1 and 2 (rule 2 is now absolute)
- Ticket 11 for the two-timestamp model and why ordering matters

## Kickoff prompt

```
/start-ticket 13
```

No new credentials. What you need is **a real trail from a real journey** — ticket 11's verification run is ideal. A trail recorded at a desk will not show you whether the line looks right.

Two things to hold onto. Order by `recorded_at`, never by arrival: ordering by arrival looks almost correct on a short test with good signal, which is exactly what makes it a mistake that ships. And **take a `pg_dump` before you test the purge** — there is one database and it is also production.
