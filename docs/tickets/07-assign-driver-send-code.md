---
ticket: 7
milestone: M2 Route planning
labels: backend,web
---

## Story / Why

Everything so far has been reversible exploration. This ticket is where a plan becomes a commitment: the route and its stops are written to the database, a consignment is attached, a driver is assigned, and a one-time code leaves the building addressed to a real person.

That change of nature is why the ticket is careful about two things. **Nothing may be half-written** — a route without its stops, or stops without a trip, is corruption that no later screen can make sense of. And **the code is a credential**: generated once, hashed immediately, never logged, never stored in plaintext, and dead the moment a newer one replaces it.

This closes M2. After it, a supervisor can plan a run end to end and a driver receives something they can act on.

## Context

Read `docs/PRD.md` §5.3 step 4, §4.5 (trip state machine) and §4.7, plus `CLAUDE.md` rules 1 and 8. Ticket 6 built steps 1–3 and hands you its wizard state.

### The code is a credential

Six characters from `A-Z2-9` **minus `O` and `I`** — no zero/one lookalikes, because a driver is reading this off a phone in a cab. Case-insensitive on entry (ticket 9's concern), unique, **SHA-256 hashed before storage**.

Generate it in the Edge Function, hash it, pass only the hash to the database, put the plaintext in exactly one place — the email body — and let it go out of scope. It must never appear in a log line, an error message, a response body, or a database column. If you are tempted to return it "just for testing", don't; check the email instead.

A resend **overwrites the hash**, so the previous code dies instantly. Newest always wins.

### Atomicity is a database concern

`supabase-js` has no multi-statement transaction, so route + stops + trip go in via a **Postgres function**, `create_trip(...)`, called by the Edge Function with the service role. All inserts succeed or none do, and the guarantee lives in the database where `CLAUDE.md` rule 1 says it belongs. This ticket carries that migration.

### Email failure must not lose the plan

The order matters: **write the trip first, then send the email.** If Resend fails, the trip still exists as `pending` with `code_sent_at` null, and the trips screen offers a resend. The supervisor loses an email, not three minutes of planning. Returning `email_failed` while leaving no trip behind would be the worst of both worlds.

### Assignment-time checks

- Driver is inactive → `driver_inactive`
- Driver already holds a `pending` or `active` trip → `driver_busy`

Both are checked in the function, and the **partial unique index from ticket 1 is the real backstop**: if two supervisors assign the same driver at the same moment, one insert violates the index. Catch that violation and return `driver_busy` rather than letting a raw Postgres error reach the client. The UI excluding busy drivers from the picker is a courtesy on top, not the guarantee.

### Manager's decisions, and what follows from them

1. **No design provided** — brand kit and the primitives from tickets 3 and 6.

2. **Resend test mode for now.** `onboarding@resend.dev` as the sender, which **only delivers to the Resend account owner's own address**. Two consequences, both real:
   - To test end to end, the driver record you assign to must use **your own email address**. Use the `test+` prefix convention from ticket 1 so it's identifiable.
   - **This must be redone before launch** — a real Resend account with `humblecoders.in` verified, and `FROM_EMAIL` changed. That belongs to ticket 15, and this ticket's README note should say so plainly so it isn't forgotten.

3. **The email carries the code and nothing about the route.** No origin, destination, stops, or consignment details.

   This is safer than it first looks, because of an invariant we already have: **a driver can hold only one live trip at a time**, so there is no "which of my three codes is this?" problem. An older code is always a dead code. The email still needs enough context to be actionable — who it's from, that it's a Humble Drive run, and that they should open the app and enter this code — but no trip details.

### Environment

No Docker, one Supabase project serving as both dev and production. `deno test` locally, `supabase functions deploy` for real checks. Deploying and sending affects the live project; there is no staging.

## 🔑 Access & prerequisites

Request from the manager over a secure channel. **Nothing here enters the repo, a commit, or this issue.**

- **`RESEND_API_KEY`** — a test-mode key. Confirm which email address it can deliver to; that address is the only one you can test with
- **`FROM_EMAIL`** — `onboarding@resend.dev` for now
- Supabase credentials and a supervisor login (tickets 1–3)
- **Confirmation that tickets 5 and 6 are merged** — you need real drivers and a working wizard
- A driver record whose email is the deliverable test address

```bash
supabase secrets set RESEND_API_KEY="..." FROM_EMAIL="onboarding@resend.dev"
```

## Scope

**1. Migration — `create_trip(...)`**

A `security definer` Postgres function taking the route, its ordered stops, the consignment fields, the driver id, the creating admin, and the **code hash**. Inserts `routes`, all `route_stops`, and the `trips` row atomically, returning the trip id. Raises distinguishable errors for inactive driver and busy driver so the Edge Function can map them to the right codes. Update `schema.sql` to match.

The function receives a hash. **It never sees a plaintext code.**

**2. `supabase/functions/trips-create/`**

Requires a supervisor. Validates the payload — origin, destination, ordered stops with type and `planned_minutes`, route polyline and duration from ticket 4, consignment fields, driver id.

Generates the code, hashes it, calls `create_trip`, then sends the email. Persists ticket 4's raw Google response into `routes.provider_response`.

Returns the trip id, and a flag indicating whether the email actually went out. Errors: `bad_request`, `driver_inactive`, `driver_busy`, `not_found`, `email_failed`.

**3. `supabase/functions/trips-resend/`**

Requires a supervisor. Generates a fresh code, **overwrites `code_hash`**, updates `code_sent_at`, re-sends. Allowed only while the trip is `pending`; anything else is `invalid_transition`.

**4. Email template**

Plain, legible, with the code prominent and readable — generous letter spacing, large enough to read at a glance. HTML with a plain-text alternative. No route details, per the decision above. No tracking pixels.

**5. Wizard step 4 — `/plan`**

- Consignment: reference, description, optional weight, receiver name, receiver phone
- Driver picker excluding inactive and busy drivers, with an explanation when the list is short or empty
- A summary card restating origin, destination, every stop with its planned minutes, drive time, break time, total run time, and the consignment
- Submit → `trips-create` → success state naming the driver and confirming the code was sent, or a clear "trip created, email failed, resend from Trips" state
- On success, **clear the wizard's `sessionStorage`** so a refresh doesn't offer to recreate a trip that already exists

**6. Strings**

`driver_inactive`, `driver_busy`, `invalid_transition` and `email_failed` all get their first real copy.

**7. Tests**

`deno test` with faked database and `fetch`: code alphabet excludes `O`, `I`, `0` and `1`; the same code never appears twice across many generations; only a hash is passed to the database; **plaintext never appears in any return value or log**; email failure still yields a created trip; `driver_inactive` and `driver_busy` map correctly, including from a unique-violation; resend overwrites the hash; resend on a non-`pending` trip returns `invalid_transition`.

## 🖼️ UI standards

Adapted for web and this project. Mobile-only items (notch, home indicator, Android gesture bar) dropped as inapplicable.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] **Reuse the primitives from tickets 3 and 6**, including the wizard shell and its step navigation. No forks

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Every colour from a token

### Native components
- [ ] Real `<form>`, `<label>`, `<input>`, `<select>` for the driver picker, `<button>` for submit
- [ ] If a native control can't do the job, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **375 px, 768 px, 1280 px+** correct; form and summary stack below 768 px
- [ ] No horizontal scrollbar at any width
- [ ] **Long place names and consignment descriptions ellipsize cleanly** in the summary card

### Input and keyboard
- [ ] `type="tel"` and `inputMode="numeric"` for receiver phone; numeric input for weight
- [ ] Autocapitalize on for names, off for the consignment reference
- [ ] **Enter submits**; the focused field stays visible above an on-screen keyboard
- [ ] Logical tab order through consignment fields, driver picker, and submit

### States and feedback
- [ ] **Loading, error and disabled** states on submit. **The submit button disables for the whole request** — a double-submit must not create two trips
- [ ] Every error code renders as friendly inline copy: a busy driver explains they already have a run; an inactive driver explains they're deactivated
- [ ] **`email_failed` is a success-with-caveat, not a failure** — say the trip was created, the email did not go, and where to resend
- [ ] **Typed consignment data survives a failed submit**
- [ ] Visible hover, focus and press feedback; `prefers-reduced-motion` respected

### Accessibility and content
- [ ] Every input has a real `<label>`; the driver picker is labelled and announces why a driver is unavailable
- [ ] Errors are associated with their fields and announced to assistive technology
- [ ] Visible focus rings; touch targets ~44 px; **WCAG AA contrast**
- [ ] Survives 200% browser zoom
- [ ] **No user-facing string literals outside `src/strings.ts`**

### Architecture and verification
- [ ] No business logic in presentational components
- [ ] **The plaintext code never reaches the browser** — not in a response, not in a console log, not in dev tools
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] A complete wizard run creates exactly one `routes` row, the right number of ordered `route_stops`, and one `trips` row
- [ ] **A forced failure partway leaves nothing behind** — no orphan route, no orphan stops
- [ ] Generated codes contain no `O`, `I`, `0` or `1`, and are 6 characters
- [ ] **Only the hash is stored.** `git grep` and a database inspection find no plaintext code column, and no log line contains one
- [ ] The code arrives by email and is readable at a glance
- [ ] **The email contains no route, stop, or consignment details**
- [ ] A resend produces a new working code and **the previous code stops working immediately**
- [ ] Resending a non-`pending` trip returns `invalid_transition`
- [ ] Assigning an inactive driver returns `driver_inactive`; assigning a busy driver returns `driver_busy`
- [ ] **Two simultaneous assignments to the same driver result in one trip**, the other returning `driver_busy` rather than a raw Postgres error
- [ ] Simulated Resend failure still creates the trip, returns `email_failed`, and the UI explains the resend path
- [ ] Double-clicking submit creates exactly one trip
- [ ] `sessionStorage` is cleared on success; refreshing afterwards does not offer to recreate the trip
- [ ] Every UI standard above is met
- [ ] `deno test` passes with no network and no credentials
- [ ] `git grep` finds no Resend key anywhere; README notes that test mode must be replaced with a verified `humblecoders.in` sender in ticket 15

## Out of scope

- The trips dashboard, listing, detail and cancel — ticket 8
- Anything the driver app does with the code — ticket 9
- Editing a saved route or trip after creation
- SMS or push delivery of the code
- Verified sending domain and production `FROM_EMAIL` — **ticket 15**, deliberately deferred by the test-mode decision
- Email delivery tracking, opens, or bounce handling

## Dependencies

**Ticket 6** — the wizard and its state.
**Ticket 5** — real drivers, and `driver_busy` semantics.
**Ticket 4** — the route payload being persisted.
**Ticket 2** — `requireAdmin`, error helpers, CORS.
**Ticket 1** — the schema and the partial unique index this relies on.

## References

- `docs/PRD.md` §5.3 step 4, §4.5, §4.7, D-7, D-17
- `CLAUDE.md` — rules 1 and 8, Data & security
- [Resend API](https://resend.com/docs/api-reference/emails/send-email) · [Resend test mode](https://resend.com/docs/dashboard/emails/send-test-emails)

## Kickoff prompt

```
/start-ticket 7
```

At kickoff, ask the manager for `RESEND_API_KEY` and **confirm which single address test mode can deliver to** — you'll need a driver record using that address to test at all.

Two things to hold onto. The code is a credential: hash it immediately, and if you ever feel the need to return it for convenience, that's the instinct the whole rule exists to stop. And write the trip before sending the email, so a mail failure costs an email rather than the entire plan.
