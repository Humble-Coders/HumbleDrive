---
ticket: 8
milestone: M3 Supervisor dashboard
labels: backend,web
---

## Story / Why

Ticket 7 can create trips but gives the supervisor nowhere to see them. Right now a run is planned, a code is emailed, and then it vanishes from the interface entirely — the only way to check anything is the Supabase dashboard.

This ticket closes that: a list of every run, a detail view of any one of them, a resend for a code that didn't arrive, and a cancel for a run that shouldn't happen. It's the last supervisor-facing web work before the project turns to Android, and it makes the web app independently useful rather than a one-way funnel.

Everything here is the **planned** picture. Actual driving — the live marker, real break times, the breadcrumb trail — arrives in ticket 13 once the Android app is producing data.

## Context

Read `docs/PRD.md` §4.5 (trip state machine), §5.4 and §4.7, plus `CLAUDE.md` rule 1.

### Cancelling is the consequential action here

`pending → cancelled` is an administrative correction: nobody has started, nothing is lost. `active → cancelled` means **a driver is currently on the road** and is being told to stop. Those are very different events sharing one status, which is why the manager has decided a reason is recorded.

- **Reason required when cancelling an `active` trip.** Optional for `pending`
- `completed` and `cancelled` are terminal — any transition out of them is `invalid_transition`, enforced server-side, not by hiding a button

The driver's app learning about a cancellation is **ticket 12's** problem. The contract this ticket must honour is simply that the status changes and stays changed; ticket 12's endpoints return `trip_cancelled` when they encounter it.

### The code is never shown

`code_hash` is a hash. There is no way to display the code, and no way should be added. The detail view shows **whether** a code was sent and when — never the code itself. If a driver says they didn't get it, the answer is resend, which mints a fresh code and kills the old one (ticket 7's `trips-resend`).

### Manager's decisions

1. **No design provided** — brand kit and the primitives from tickets 3, 5, 6 and 7.
2. **A reason is recorded on cancel**, which means a small migration.
3. **Live runs first, then recent.** `active` and `pending` sort above `completed` and `cancelled`, everything newest-first within that. A supervisor opens this page to see what's happening now.
4. **Server-side paging, 10 per page.** Filters applied in SQL, not in the browser. Ticket 5's client-side approach was right for a capped roster of ~50 drivers; trips grow without limit, so the same shortcut here would break quietly a few months in.

   Note the interaction with sorting: it's a **single ordered query** — live runs first, then newest — paged 10 at a time. Page 1 therefore shows live runs followed by recent ones. Live runs are not pinned separately across pages.

### Environment

No Docker, one Supabase project serving as both dev and production. `deno test` locally, `supabase functions deploy` for real checks.

## 🔑 Access & prerequisites

- Supabase credentials and a supervisor login (tickets 1–3)
- **`VITE_GOOGLE_MAPS_BROWSER_KEY`** — already in `.env` from ticket 6; the detail view renders the planned route on a map
- **Confirmation that ticket 7 is merged** — you need real trips to list. Create several through the wizard covering every status, using `test+` driver records
- To produce a `completed` trip before ticket 14 exists, set the status directly in the database. Note in the handoff that you did

Nothing new is needed from the manager.

## Scope

**1. Migration**

Add to `trips`: `cancel_reason text`, `cancelled_at timestamptz`, `cancelled_by uuid` referencing `admins(user_id)`. Update `schema.sql` to match. Forward-only, per ticket 1.

**2. `supabase/functions/trips-list/`**

Requires a supervisor. Accepts `status` (optional, one or many), `driverId` (optional), `limit` and `offset`. Returns the page plus a total count so the UI can show "11–20 of 47".

Each row: trip id, status, driver name, origin and destination names, total planned run time, stop count, consignment reference, created time, and whether a code has been sent.

Ordering is fixed server-side per the decision above — not a client-supplied sort.

**3. `supabase/functions/trips-detail/`**

Requires a supervisor. One trip in full: route with `encoded_polyline`, ordered stops with type and `planned_minutes`, drive duration, break total, computed total, consignment fields, driver name and contact, status, `code_sent_at`, and cancellation fields when present.

**Never returns `code_hash`.** Not for debugging, not behind a flag.

Unknown id → `not_found`.

**4. `supabase/functions/trips-cancel/`**

Requires a supervisor. Takes trip id and an optional reason.

- `pending` or `active` → `cancelled`, recording reason, timestamp and the cancelling supervisor
- **Reason is required when the trip is `active`** — missing it is `bad_request`
- `completed` or `cancelled` → `invalid_transition`
- Unknown id → `not_found`

**5. `/trips` — the list**

Replaces ticket 3's placeholder.

- Rows showing status, driver, origin → destination, planned duration, stops, consignment ref, created time
- Filters for status and driver; filter state reflected in the URL so a view can be linked and survives refresh
- Pagination controls, 10 per page, with the current range and total
- Row click opens the detail view
- Below 768 px, rows become stacked cards

**6. `/trips/:id` — the detail**

- Planned route drawn on a map with numbered stop markers, reusing ticket 6's map component
- Stop list with type and planned minutes
- Consignment and driver panels
- Code status: sent or not, and when. **Never the code**
- **Resend** action for `pending` trips, calling ticket 7's `trips-resend`, with clear confirmation that the previous code has stopped working
- **Cancel** action for `pending` and `active`, with a reason field that is required for `active`, and confirmation naming the driver and destination
- A clearly-marked placeholder where live tracking will appear, naming ticket 13 — an unexplained blank panel reads as a bug

**7. Strings**

`not_found` and `invalid_transition` get their first list-and-detail copy.

**8. Tests**

`deno test` with a faked database: ordering puts live runs first; paging returns the right slice and total; status and driver filters compose; `trips-cancel` rejects an active cancel with no reason; terminal states return `invalid_transition`; **`trips-detail` never includes `code_hash`**; all three reject a non-supervisor.

## 🖼️ UI standards

Adapted for web and this project. Mobile-only items (notch, home indicator, Android gesture bar) dropped as inapplicable.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] **Reuse existing primitives**, including ticket 6's map component and ticket 5's responsive table-to-cards pattern. Extend in place; do not fork

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Every colour from a token, including status colours, which must be defined once and shared. **Status must not be conveyed by colour alone** — pair it with text

### Native components
- [ ] Real `<table>` for the list, `<form>` and `<label>` for filters and the cancel reason, native `<select>` for filter dropdowns
- [ ] If a native control can't do the job, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **375 px, 768 px, 1280 px+** correct. List reflows to stacked cards below 768 px; detail panels stack under the map
- [ ] The map keeps a usable minimum height when stacked
- [ ] No horizontal scrollbar at any width
- [ ] **Long place names, consignment descriptions and cancel reasons ellipsize cleanly** — with the full value available on the detail page

### Input and keyboard
- [ ] Filters are keyboard-operable and announce their effect on the list
- [ ] Cancel reason is a `<textarea>` with a real label; **Enter inside it must not submit**, since a reason can run to a couple of lines
- [ ] Pagination controls are real buttons, reachable and operable by keyboard
- [ ] Logical tab order; focus moves into a dialog when it opens and returns to the trigger when it closes

### States and feedback
- [ ] **Loading, empty, error and disabled** states for list and detail. The empty list distinguishes "no trips yet" from "no trips match these filters", and the second offers to clear them
- [ ] Destructive and irreversible actions confirm first: cancel names the driver and destination; resend states plainly that the previous code stops working
- [ ] Action buttons disable during their request; a double-click must not cancel twice or send two codes
- [ ] `not_found` renders as a proper page state, not a crash
- [ ] **The tracking placeholder is explicit**, naming what will appear there and when
- [ ] Visible hover, focus and press feedback; `prefers-reduced-motion` respected

### Accessibility and content
- [ ] Table has proper header cells and scope; every filter and the reason field has a real `<label>`
- [ ] Status is announced as text, not inferred from a colour swatch
- [ ] **The map is not the only way to understand the route** — origin, destination, stops and durations are all present as text
- [ ] Visible focus rings; touch targets ~44 px; **WCAG AA contrast** including status colours
- [ ] Survives 200% browser zoom
- [ ] **No user-facing string literals outside `src/strings.ts`**

### Architecture and verification
- [ ] No business logic in presentational components; fetching and paging live outside them
- [ ] The UI never enforces a rule the server doesn't — a hidden cancel button is a hint, and the endpoint still refuses
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] The list shows `active` and `pending` trips above `completed` and `cancelled`, newest-first within that
- [ ] Paging returns 10 per page with an accurate total; page 2 does not repeat or skip rows
- [ ] Status and driver filters compose, are applied **in SQL**, and are reflected in the URL
- [ ] Filter state survives a page refresh
- [ ] Detail shows route, ordered stops with planned minutes, consignment, driver, and drive + break + total
- [ ] **No response from any endpoint contains `code_hash`**, and the code is nowhere in the UI
- [ ] Resend on a `pending` trip mints a new code, and the confirmation says the previous one has stopped working
- [ ] **Cancelling an `active` trip without a reason returns `bad_request`**; with a reason it succeeds and stores reason, timestamp and supervisor
- [ ] Cancelling a `pending` trip works with no reason
- [ ] Cancelling a `completed` or `cancelled` trip returns `invalid_transition`
- [ ] Double-clicking cancel or resend performs the action once
- [ ] An unknown trip id renders a proper not-found state
- [ ] Every UI standard above is met
- [ ] `deno test` passes with no network and no credentials
- [ ] Migration applied, `schema.sql` updated, RLS unchanged
- [ ] `git grep` finds no hex colour in a component and no user-facing string literal outside `src/strings.ts`

## Out of scope

- **Live tracking, the driver marker, breadcrumb replay, and actual break times** — ticket 13. This ticket shows the planned picture only, with a labelled placeholder
- Delivery photo display — ticket 14
- Notifying the driver's app of a cancellation — ticket 12
- Editing a trip or its route after creation
- Export, reporting, or analytics
- Deleting trips. Cancel is the terminal action; nothing is destroyed

## Dependencies

**Ticket 7** — trips to list, and `trips-resend` for the resend action.
**Ticket 6** — the map component reused on the detail page.
**Ticket 5** — the responsive table pattern.
**Ticket 3** — shell, routing, primitives, strings.
**Ticket 2** — `requireAdmin`, error helpers, CORS.

## References

- `docs/PRD.md` §4.5 (state machine), §5.4, §4.7
- `CLAUDE.md` — rule 1, rule 7, Frontend
- Ticket 7 for `trips-resend` and the trip shape

## Kickoff prompt

```
/start-ticket 8
```

No new credentials beyond tickets 1–7. Create several trips through the wizard first, covering every status, so the list and its filters have something real to work against.

Two things to hold onto. The code cannot be displayed and no route to displaying it should be added — resend is the answer to a missing code. And cancelling an active trip stops someone who is currently driving, which is why the reason is required rather than optional.
