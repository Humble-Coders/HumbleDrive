---
ticket: 5
milestone: M2 Route planning
labels: backend,web
---

## Story / Why

Before a supervisor can assign a run, there has to be someone to assign it to. This ticket gives them the driver roster: add a driver, correct their details, and take them off the list when they leave.

It's small, and it's the first ticket where an Edge Function and its UI ship together — which is deliberate. An endpoint with no caller can only be verified with a curl command; a screen with no endpoint can't be verified at all. Together they have a real acceptance criterion.

It also carries one rule that matters more than it looks: **a driver is never deleted.** Trips reference drivers, and a completed run has to keep naming who drove it. Everything here is built around deactivation instead.

## Context

Read `docs/PRD.md` §5.2 and §4.7, and the Data & security section of `CLAUDE.md`.

**Lowercase emails are a safety invariant, not a formatting preference.** `drivers.email` carries `check (email = lower(btrim(email)))` from ticket 1. The reason: two casings of one address would be two driver records for one human, and every per-driver guarantee — one active run at a time, most obviously — silently stops working. The database rejects mixed case; your job is to lowercase before sending so the supervisor never sees a constraint violation for something the app should have handled.

**`driver_busy` is a real check against real data.** A driver with a `pending` or `active` trip cannot be deactivated. Not because the UI hides the button, but because the endpoint checks and refuses. The button being disabled is a courtesy on top.

**Manager's decisions:**

1. **Deactivate only. No delete, anywhere.** Not a hidden delete, not a "delete if they have no trips". Deactivating removes them from the assignment picker in ticket 7 while preserving every historical record. If you catch yourself adding a destructive action, re-read this.

2. **Email is editable at any time, with a warning.** People change addresses, and typos happen — locking the field would force a duplicate driver record, which is precisely the problem the lowercase rule exists to prevent. But if the driver has a **pending** trip, the UI must warn plainly: the booking code went to the old address, and it needs resending from the trips screen (ticket 7's `trips-resend`). Past trips keep their own history and are unaffected.

3. **Phone numbers are Indian 10-digit, stored normalised.** Accept what a human would type — spaces, dashes, a leading `+91` or `0` — strip it all, store ten digits. This matches the India-only restriction from ticket 4 and keeps the column usable if SMS is ever added.

   **This one is validated in the Edge Function, not by a database constraint**, and the distinction is worth understanding. Email case is a safety invariant: getting it wrong breaks a guarantee, so Postgres enforces it. Phone format is a data-quality preference: getting it wrong is untidy, not unsafe. It doesn't warrant a migration, and `CLAUDE.md` rule 1 is about invariants, not tidiness.

4. **No design provided** — build against the brand kit and the shared primitives from ticket 3. Reuse them; do not fork them.

**Scale.** Five to fifty drivers, per the PRD. No pagination, no server-side search. A client-side filter box over the full list is the right answer, and anything more is speculative.

**Environment.** No Docker, one Supabase project serving as both dev and production. `deno test` locally, `supabase functions deploy` for the real check.

## 🔑 Access & prerequisites

- Supabase project URL and anon key, and a supervisor login (from tickets 1–3)
- **Confirmation that tickets 2 and 3 are merged and `admin-me` is deployed**
- Two or three realistic driver records to test with — ask the manager, or invent them using the `test+` prefix convention from ticket 1 so they can be told apart from real data later

Nothing new is needed from the manager beyond what tickets 1–3 already required.

## Scope

**1. `supabase/functions/drivers/`**

One function, four actions, all requiring a supervisor via `requireAdmin`:

- **List** — every driver with `active`, plus their current trip if one is `pending` or `active` (id, status, and destination name, enough for the table)
- **Create** — name, email, phone. Lowercase and trim the email, normalise the phone, then insert
- **Update** — name, email, phone
- **Set active** — deactivate or reactivate

Errors: `bad_request` for a missing name, a malformed email, or a phone that isn't ten digits after normalising; `not_found` for an unknown id; **`driver_busy`** when deactivating a driver with a live trip. A duplicate email is `bad_request` with a message naming the conflict — the supervisor needs to know it's a duplicate, not a mystery.

**2. `/drivers` page**

Replaces ticket 3's placeholder.

- Table: name, email, phone, status, current run, actions
- Filter box, filtering client-side across name, email and phone
- Add and edit forms, reusing ticket 3's primitives
- Deactivate and reactivate, with confirmation on deactivate
- The email-change warning described above, shown when the driver has a pending trip
- Below 768 px the table becomes stacked cards — a horizontally scrolling six-column table on a phone is not responsive, it's a table that happens to scroll

**3. Strings**

All copy through `src/strings.ts`, including `driver_busy`, which now has its first real screen.

**4. Tests**

`deno test` on the function with a faked database layer: email lowercasing, phone normalisation across the input variants above, `driver_busy` on deactivating a live driver, duplicate email, non-supervisor rejection.

## 🖼️ UI standards

Adapted for web and this project. Mobile-only items (notch, home indicator, Android gesture bar) dropped as inapplicable.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply on this ticket
- [ ] **Reuse ticket 3's primitives** — button, input, card, page header. No forked copies, no one-off hex values, no ad-hoc spacing. If a primitive needs extending, extend it in place so ticket 6 inherits the improvement

### Theming
- [ ] **Dark theme only**, per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Every colour from a token; nothing hardcoded in a component

### Native components
- [ ] Semantic HTML: a real `<table>` for tabular data, real `<form>`, `<label>`, `<button>`, `<input>`. Do not hand-roll what the browser provides
- [ ] If a native control genuinely can't do what's needed, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **375 px, 768 px, 1280 px+** all correct. Table reflows to stacked cards below 768 px
- [ ] No horizontal scrollbar at any supported width
- [ ] Content width capped and centred on wide screens
- [ ] **Long values ellipsize cleanly** — a long email must not stretch a column or push the actions off-screen

### Input and keyboard
- [ ] `type="email"` and `type="tel"` on the right fields, so phones show the right keyboard
- [ ] Autocapitalize and autocorrect off on email; on for name
- [ ] **Enter submits** the add/edit form; Escape closes it without saving
- [ ] Logical tab order; focus moves into the form when it opens and returns to the trigger when it closes
- [ ] The focused field stays visible above an on-screen keyboard

### States and feedback
- [ ] **Loading, empty, error and disabled** states all defined. The empty state ("no drivers yet") must invite the first action, not show a blank table
- [ ] Submit disables and shows progress during the request; errors appear inline in the app's own styling
- [ ] **Typed input is never lost on a failed submit**
- [ ] Visible hover, focus and press feedback; `prefers-reduced-motion` respected
- [ ] Deactivate asks for confirmation and names the driver in the prompt

### Accessibility and content
- [ ] Every input has a real `<label>`; icon-only buttons have accessible names
- [ ] Table has proper header cells and scope; the filter box is labelled
- [ ] **Visible focus rings** throughout
- [ ] Touch targets ~44 px; **WCAG AA contrast**, checking `muted-text` on `card` in particular
- [ ] Survives 200% browser zoom
- [ ] **No user-facing string literals outside `src/strings.ts`**

### Architecture and verification
- [ ] Functional components and hooks; no business logic in presentational components
- [ ] The UI never enforces a rule the server doesn't — a disabled deactivate button is a hint, and the endpoint still refuses
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] `Foo@Bar.com ` is stored as `foo@bar.com`; the supervisor never sees a raw constraint error
- [ ] A duplicate email is rejected with a message that says it's a duplicate
- [ ] `98765 43210`, `+91 9876543210`, `09876543210` and `9876543210` all normalise to the same stored value
- [ ] An 8-digit or 12-digit phone is rejected as `bad_request`
- [ ] **Deactivating a driver with a `pending` or `active` trip returns `driver_busy`** and the record is unchanged
- [ ] A deactivated driver can be reactivated
- [ ] **No delete action exists** in the API or the UI
- [ ] Editing the email of a driver with a pending trip shows the resend warning; editing one without a pending trip does not
- [ ] The list shows each driver's current run when they have one
- [ ] The filter box matches on name, email and phone
- [ ] Every endpoint returns `unauthorized` with no JWT and `not_admin` for a non-supervisor
- [ ] Every UI standard above is met
- [ ] `deno test` passes with no network and no credentials
- [ ] Function deployed and verified end to end against the real project
- [ ] `git grep` finds no hex colour in a component and no user-facing string literal outside `src/strings.ts`

## Out of scope

- Assigning trips, and the `driver_inactive` error — that fires at assignment time in ticket 7
- Resending a booking code — ticket 7's `trips-resend`. This ticket only *warns* that a resend will be needed
- Driver accounts, logins, or self-service of any kind. Drivers never authenticate here (PRD non-goals)
- Pagination, server-side search, bulk import, CSV upload
- Vehicle records — PRD open decision OD-5, currently out of v1

## Dependencies

**Ticket 2** — `requireAdmin`, error helpers, CORS.
**Ticket 3** — the app shell, routing, primitives, and the strings module.
**Ticket 1** — the `drivers` table and its constraints.

## References

- `docs/PRD.md` §5.2 (driver management), §4.7 (error contract), §3 (roles)
- `CLAUDE.md` — Data & security, Frontend
- Ticket 1's schema for the exact `drivers` columns and constraints

## Kickoff prompt

```
/start-ticket 5
```

No new credentials are needed beyond tickets 1–3. Confirm `admin-me` is deployed and the app shell is merged before starting.

Two things to hold onto: never build a delete, and let the database keep enforcing what it enforces — lowercase the email before sending so the supervisor gets a friendly message rather than a constraint violation, but don't remove the constraint.
