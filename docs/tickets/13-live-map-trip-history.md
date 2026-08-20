---
ticket: 13
milestone: M5 Live tracking
labels: backend,web
---

## Story / Why

The driver app has been recording everything since ticket 11 — where the vehicle went, when it stopped, how long each break actually took — and none of it is visible to anyone. Ticket 8 left a labelled placeholder on the trip detail page for exactly this.

This ticket fills it, twice over. **Live:** while a run is active, the supervisor watches the vehicle move. **After:** the recorded trail drawn over the planned route, with each break stop showing planned minutes against what actually happened.

It's the payoff for the whole tracking pipeline, and it's the ticket where the two halves of the product finally meet.

## Context

Read `docs/PRD.md` §5.4, §4.4 and decisions **D-33, D-34**, plus `CLAUDE.md` rules 1 and 2. Ticket 8 built the trip detail page this extends.

### This ticket owns the live map completely

**D-33: live tracking is in v1 and is delivered entirely within this ticket.** The subscription, the marker, and the one RLS policy it needs all arrive here. No other ticket changes — the driver app already records everything, ticket 8 already left the placeholder, and the policy comes in this ticket's own migration.

### The one policy in the entire system

`CLAUDE.md` rule 2 keeps RLS on with **zero policies** everywhere, and names exactly one exception: a Realtime read feed on `track_points`. This ticket is where that exception is created, and it is the only one that will ever exist. Get it exactly right:

- **`SELECT` only.** No `INSERT`, `UPDATE` or `DELETE` policy on `track_points`, ever. Writes stay with the service role via `driver-track`
- **Gated on an active supervisor** — the policy must require an authenticated user with an active row in `admins`. Not merely `authenticated`, which would include any Supabase Auth user
- **The anon key must get nothing.** Verify this explicitly rather than assuming
- The policy covers `track_points` alone. Every other table keeps zero policies

If you find yourself adding a second policy to make something work, stop — that is a signal the data should be coming through an Edge Function instead.

### Live is a subscription; history is a fetch

**While `active`:** load the trail so far via `trips-detail`, then subscribe to `track_points` filtered by trip id and append incoming fixes. The marker follows. Target is roughly 5 seconds from a fix reaching the server to the marker moving — which is a consequence of ticket 11's batching, not something to optimise here.

**Once terminal:** no subscription. A completed or cancelled trip is static; subscribing to it wastes a connection and can never receive anything.

Unsubscribe on unmount, on navigation, and when a trip transitions to terminal while being watched. A leaked subscription per page view is the classic failure here.

### Trails are ordered by `recorded_at`, always

`track_points` carries two timestamps, frequently hours apart: `recorded_at` is the device clock when the fix was taken, `received_at` is the server clock when it arrived. Ticket 11's offline queue means a fix taken in a dead zone at 2pm can arrive at 4pm, after fixes taken at 3pm.

**Order by `recorded_at`.** Ordering by arrival draws a trail that jumps backwards across the map — and it looks almost right on a short test with good signal, which is exactly what makes it a mistake that ships.

This matters live too: a driver leaving a dead zone dumps a backlog, and those fixes must slot into the trail by when they were taken, not append at the end.

### Trails are downsampled server-side

A six-hour run at 5-second intervals is roughly 4,000 points; longer runs are worse. `trips-detail` returns **at most ~500 points**, thinned evenly or by Douglas–Peucker. The line looks identical at map zoom, the payload stays small, and it does not degrade as runs get longer.

Downsample in SQL or in the function — never in the browser. Sending 20,000 points to thin them client-side defeats the purpose. Live fixes arriving by subscription are appended as they come; only the initial load is thinned.

### Planned versus actual

For each stop: planned minutes from `route_stops`, actual from `trip_stop_events` (`resumed_at - arrived_at`). Three states, all normal:

- **Taken** — both timestamps present; show actual against planned, marking overruns and undershoots
- **In progress** — arrived, not yet resumed; show elapsed so far, ticking live during an active run
- **Not taken** — no event row. Per ticket 12, skipping is implicit: the driver drove on

**Not taken is not a failure.** D-8 makes breaks advisory, so present it as information. The supervisor is being informed, not handed a stick.

### Retention

**D-34, resolving OD-3: `track_points` live 90 days, then a scheduled purge.** The trip, its stop events and its summary survive; only the fine-grained trail expires. This ticket adds the purge job and permanent per-trip summary columns — distance travelled, first and last fix — so a two-year-old trip still says something true after its trail is gone.

### Manager's decisions

1. **No design provided** — brand kit and the primitives from tickets 3, 6 and 8
2. **Live map is in, scoped entirely to this ticket** (D-33)
3. **Server-side downsampling**, capped at ~500 points
4. **90-day retention with a purge job** (D-34)

### Environment

No Docker, one Supabase project serving as both dev and production. The purge job is destructive by design — see prerequisites.

## 🔑 Access & prerequisites

- Supabase credentials and a supervisor login (tickets 1–3)
- **`VITE_GOOGLE_MAPS_BROWSER_KEY`**, already in `.env` from ticket 6
- **Realtime enabled for `track_points`** in the Supabase dashboard — ask the manager to confirm, or enable it yourself if you have access. The subscription silently receives nothing if the table is not in the publication, which is a confusing hour to lose
- **An active trip you can watch move** — the most reliable setup is a colleague driving with the app while you watch, or the dev running ticket 11's journey with a second machine open
- **A completed trip with a real recorded trail**, ideally ticket 11's verification run
- **A trip with a break taken and one driven past**, so both states render
- **Confirmation that tickets 11 and 12 are merged**
- **Before testing the purge, take a `pg_dump`.** There is one database and it is also production; a mis-scoped delete has no undo

## Scope

**1. Migration**

- **The single RLS `SELECT` policy on `track_points`**, gated on an active `admins` row, as described above
- Trip summary columns surviving the purge: `distance_travelled_m`, `first_fix_at`, `last_fix_at`
- The **purge function** deleting `track_points` older than 90 days, scheduled with `pg_cron`. **Scoped by age only** — never by trip, never by driver
- Update `schema.sql`

**2. `trips-detail` — extended**

Adds the trail (ordered by `recorded_at`, downsampled to ~500 points), per-stop actuals with their three states, the trip summary, and a flag indicating the trail was purged so the UI can explain rather than show an empty map.

**3. Trip detail — the tracking panel**

Replaces ticket 8's placeholder.

- **Active trips:** live marker following the driver, trail building behind, subscription appending fixes in `recorded_at` order, in-progress break timer ticking
- **Terminal trips:** static trail over the planned route, planned versus actual for every stop, no subscription
- **Recorded trail drawn over the planned route**, visually distinct — planned recessive, actual prominent
- Trip summary: distance travelled, first and last fix, total elapsed
- Clear messages for a purged trail and for a trip that never started

**4. Strings**

Copy for the three stop states, the purged-trail message, the not-started case, and a lost-connection notice.

**5. Tests**

`deno test` with a faked database: ordering by `recorded_at` including out-of-order arrivals; downsampling caps the count while keeping first and last; the three stop states; the purged flag. SQL tests: the policy allows an active supervisor and **denies anon and a non-admin authenticated user**; the purge deletes only rows older than 90 days.

## 🖼️ UI standards

Adapted for web and this project. Mobile-only items (notch, home indicator, Android gesture bar) dropped as inapplicable.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] **Reuse ticket 6's map component and ticket 8's detail layout.** Extend in place; do not fork

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Planned and actual routes distinguishable **by more than colour alone** — weight, opacity or dash — so the distinction survives a colour-blind viewer
- [ ] Every colour from a token, including stop-state indicators and the live marker

### Native components
- [ ] Semantic HTML for the stop table and summary; real `<button>` for controls
- [ ] If something can't be done natively, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **375 px, 768 px, 1280 px+** correct; map and panels stack below 768 px with a usable map height
- [ ] No horizontal scrollbar at any width
- [ ] **Long stop and place names ellipsize cleanly** in the comparison table

### Input and keyboard
- [ ] Map controls keyboard-reachable
- [ ] No text input on this view

### States and feedback
- [ ] **Live, loading, error, and three distinct empty states**: not started, trail purged, and started-but-no-fixes. These mean different things and must read differently
- [ ] **A dropped Realtime connection is visible and recovers** — say "reconnecting", retry, and never leave a stale marker looking live
- [ ] **A not-taken break is neutral information, not an error state** (D-8)
- [ ] The live marker moves smoothly rather than teleporting; **`prefers-reduced-motion` disables the tween**
- [ ] A long trail must not block the rest of the page from rendering
- [ ] Visible hover and focus feedback

### Accessibility and content
- [ ] **The map is not the only way to read the outcome** — distance, timings and every planned-versus-actual figure present as text
- [ ] Live status announced politely to assistive technology, not as a stream of interruptions
- [ ] Stop table has proper headers and scope; states announced as text, not inferred from colour
- [ ] Visible focus rings; touch targets ~44 px; **WCAG AA contrast**, including both route lines against the dark map
- [ ] Survives 200% browser zoom
- [ ] **No user-facing string literals outside `src/strings.ts`**

### Architecture and verification
- [ ] No business logic in presentational components; subscription lifecycle handled outside them
- [ ] **Subscriptions are torn down on unmount, navigation, and terminal transition** — no leaks across page views
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] **An active trip shows the driver's marker moving**, within roughly 5 s of a fix reaching the server
- [ ] The trail builds behind the marker as the run proceeds
- [ ] **A backlog arriving after a dead zone slots into the trail by `recorded_at`**, not appended at the end
- [ ] **No subscription is opened for a completed or cancelled trip**
- [ ] Navigating away tears the subscription down; opening ten trips in succession leaks nothing
- [ ] A dropped connection shows a reconnecting state and recovers without a reload
- [ ] **The RLS policy allows an active supervisor, and denies both anon and an authenticated non-admin** — verified explicitly
- [ ] **`track_points` has exactly one policy, `SELECT` only; every other table still has zero**
- [ ] A trail of 4,000+ points is downsampled to ~500 server-side, first and last preserved; the browser never receives the full trail
- [ ] Each break stop shows the right state, with an in-progress timer ticking live during an active run
- [ ] **A not-taken stop reads as neutral information**
- [ ] Trip summary shows distance travelled, first and last fix, total elapsed
- [ ] The three empty states are distinguishable and correctly worded
- [ ] **The purge deletes only `track_points` older than 90 days**, leaving trips, stop events and summaries intact — proven by a SQL test
- [ ] A purged trail still shows its summary with a clear explanation
- [ ] Every UI standard above is met
- [ ] `deno test` and SQL tests pass
- [ ] Migration applied and `schema.sql` updated

## Out of scope

- Delivery photo display — ticket 14
- Animated playback of a historical trail over time. Live movement yes; scrubbing through the past, no
- Live ETA recalculation — excluded by PRD non-goals
- Export, reporting, analytics, or per-driver aggregates
- Speed, harsh-braking, or driver-behaviour analysis
- Push notifications — PRD **OD-2**, still open
- **Any second RLS policy.** If something seems to need one, route it through an Edge Function instead

## Dependencies

**Ticket 12** — `trip_stop_events` with real arrival and resume times.
**Ticket 11** — `track_points` with real trails.
**Ticket 8** — the trip detail page and its placeholder.
**Ticket 6** — the map component.

## References

- `docs/PRD.md` §5.4, §4.4, §6, and D-8, D-21, D-33, D-34
- `CLAUDE.md` — rules 1 and 2, including rule 2's single named exception
- Ticket 11 for the two-timestamp model and why ordering matters
- [Supabase Realtime — Postgres changes](https://supabase.com/docs/guides/realtime/postgres-changes) · [RLS policies](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Kickoff prompt

```
/start-ticket 13
```

At kickoff, **confirm `track_points` is in the Realtime publication** — a subscription against a table that isn't silently receives nothing, and that is a confusing hour to lose. Arrange a way to watch a real trip move; a colleague driving with the app is the most reliable setup.

Three things to hold onto. This ticket creates the **only** RLS policy in the system: `SELECT` only, gated on an active supervisor, anon gets nothing. Order by `recorded_at`, never by arrival — it looks almost right on a short test, which is what makes it ship. And **take a `pg_dump` before testing the purge**: there is one database and it is also production.
