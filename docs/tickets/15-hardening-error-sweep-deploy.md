---
ticket: 15
milestone: M6 Completion & release
labels: web,android,infra
---

## Story / Why

Fourteen tickets built a working product one slice at a time. Each was verified against its own criteria, by whoever happened to be holding it, on whatever device was to hand. This ticket is the first time anyone looks at the whole thing at once.

That matters because the failures this catches are the ones no individual ticket could. Error copy that reads fine in isolation but is inconsistent across fifteen screens. A contrast pairing that appears on six pages and was checked on none. An email sender that still only delivers to one address. It also closes the one operational hole we knowingly left open, and puts the thing somewhere a person can actually use it.

This is the last ticket. When it's done, Humble Drive is finished.

## Context

Read `docs/PRD.md` §6 (non-functional requirements) and §4.7 (the error contract), and `CLAUDE.md` end to end. Then read the acceptance criteria of every ticket from 1 to 14 — this ticket audits their combined result.

**No new screens.** This is a verification, correction and deployment pass, plus one small feature the manager has asked for. The UI standards below are the audit checklist, not a build brief.

### The one new feature: supervisor force-complete (D-35)

Ticket 14 gates completion on the driver being within ~200 m of the destination, read from a fresh, accurate GPS fix. A driver in a covered loading bay or an urban canyon may never get one — and today there is no override and no way for a supervisor to complete on their behalf. The only workaround is cancelling, which falsely records a delivered consignment as cancelled.

So: a **supervisor-only** action that completes a trip **without a photo**, recording who forced it and why.

- Reason is **required** — a force-complete with no explanation is worse than none
- Recorded distinguishably from a normal completion. The trip detail must make clear this run was closed by a supervisor, not confirmed by a driver at the destination
- Available for `active` trips only; terminal states return `invalid_transition`
- Revokes the driver's session and ends tracking, exactly as a normal completion does

**Do not build this as a way around the geofence for drivers.** It is an administrative escape hatch, on the supervisor's surface, used rarely and visibly.

### The error contract sweep

PRD §4.7 fixes fifteen codes across two clients. The requirement is not "handled" — it is that **every code has been deliberately triggered and its copy read**, on the surface where it appears.

Reaching some of them takes effort: `routes_failed` needs the Google quota exceeded or the key disabled; `email_failed` needs Resend to fail; `session_expired` needs a revoked token. Do it anyway — temporarily breaking a key is a legitimate way to see the copy a supervisor would see.

Copy should tell someone what to do next, not merely what went wrong. `driver_busy` says which run the driver is already on. `code_already_used` suggests they may have verified on another device.

### Retention, both kinds (D-34, D-36)

Ticket 13 added the 90-day `track_points` purge. This ticket extends it: **delivery photos are purged on the same schedule**, and the trip retains a flag that a photo existed.

The trade-off is accepted knowingly: a dispute more than 90 days after delivery has no photographic evidence. If that turns out to be wrong, it's a policy change and a new decision, not a bug.

### Email (D-38)

`humblecoders.in` is verified in Resend and `FROM_EMAIL` becomes a real address on it. Test mode delivers to one address only, so no real driver could ever be onboarded — this is the difference between a demo and a usable system.

**DNS propagation takes hours.** Confirm with the manager that verification is already done before starting; it is not something to begin on the last afternoon.

### Deployment (D-37, D-30)

- **Web** → Vercel on merge to `main`, on the **default Vercel domain**. No custom subdomain in v1
- **Edge functions** → `supabase functions deploy`, manual, documented
- **Android** → internal testing or direct APK. No public Play listing, so no background-location review

### Manager's decisions

1. **Supervisor force-complete** is in this ticket (D-35)
2. **Photos purge with the trail at 90 days** (D-36)
3. **`humblecoders.in` verified**, real `FROM_EMAIL` (D-38)
4. **Vercel default domain** (D-37)

### Environment

No Docker, one Supabase project serving as both dev and production — which is now genuinely production. **Take a `pg_dump` before the retention migration.**

## 🔑 Access & prerequisites

- **Confirmation that `humblecoders.in` is verified in Resend**, and the `FROM_EMAIL` address to use. Verify this is done *before* starting
- Vercel account access, or the manager connects the repo and hands over deploy rights
- Supabase credentials, supervisor login, Android `local.properties`
- **Two devices for the responsive and font-scale passes** — smallest and largest phone you can get hold of — and a desktop browser
- A means of triggering failures: ability to temporarily disable the Google key, and a way to make Resend fail
- **Confirmation that tickets 1–14 are all merged**
- **A `pg_dump` taken before the retention migration**

## Scope

**1. Supervisor force-complete (D-35)**

- `trips-force-complete` Edge Function: supervisor auth, `active` only, **reason required**, no photo, records supervisor and reason, revokes the driver session, sets `completed_at`
- Migration: `force_completed_by`, `force_complete_reason`
- Trip detail action with confirmation naming the driver and destination, and a clear marker on force-completed trips
- Copy that distinguishes it plainly from a driver-confirmed delivery

**2. Photo retention (D-36)**

Extend ticket 13's purge to delete Storage objects for trips older than 90 days, setting a `photo_purged` flag so the UI explains rather than shows a broken image. Update `schema.sql`.

**3. Error contract sweep**

Every one of the fifteen codes triggered and its copy reviewed on the surface where it appears — ten supervisor codes on web, seven driver codes on Android, `unauthorized` and `bad_request` on both. Record in the handoff how each was triggered.

**4. Responsive, accessibility and theme audit**

Both clients, against the checklist below. Fix what fails; log anything deliberately not fixed.

**5. Deployment**

Vercel project connected to `main`, environment variables set, deployed and verified. Edge function deployment documented as a runbook. Android internal-testing or APK build produced and installed on a clean device.

**6. `README.md`**

A complete ops runbook: setting up Supabase from scratch, all four external services (Supabase, Google Cloud with its **three keys**, Resend, Vercel), applying migrations, deploying functions, building the Android app, creating a supervisor, and the retention policy. Written so someone who has never seen the project can follow it.

**7. Secret audit**

`git grep` and a full history scan for keys, tokens, plaintext codes and connection strings. **Secret scanning with push protection enabled** on the repo. `.env.example` complete on both platforms.

## 🖼️ UI standards — the audit checklist

Every item verified **across both clients and every screen**. This is the pass where these stop being per-ticket promises and become facts.

### Design fidelity
- [ ] Both clients use their design tokens consistently. **No hardcoded colour or spacing anywhere** — verified by grep, not by eye
- [ ] Shared primitives are genuinely shared. Forked near-duplicates are consolidated

### Theming
- [ ] **Dark theme only**, correct on every screen of both clients (PRD D-21 — the deliberate override of the usual light+dark requirement)
- [ ] Both map styles are dark and legible

### Native components
- [ ] Semantic HTML on web, Material 3 on Android. Any hand-rolled substitute for a native control is justified in the handoff

### Layout, insets and responsiveness
- [ ] **Web: 375 / 768 / 1280 px+** on every route. **No horizontal scrollbar anywhere**
- [ ] **Android: smallest and largest supported phone, both orientations**, every screen
- [ ] **Safe areas**: no Android control under the gesture bar or status bar — check every primary button
- [ ] Long place names, consignment text and stop names **ellipsize cleanly everywhere**

### Input and keyboard
- [ ] Correct keyboard type on every field, both clients
- [ ] Enter/Done submits where it should, and does not where it shouldn't (ticket 8's cancel-reason textarea)
- [ ] **The whole web app is operable by keyboard alone**, including the wizard and the trips dashboard
- [ ] Focused fields stay visible above on-screen keyboards

### States and feedback
- [ ] **Every screen that fetches or submits has loading, empty, error and disabled states.** No blank screens, no dead buttons
- [ ] Empty states are distinguishable and specific — "no trips yet" is not "no trips match these filters"
- [ ] **All fifteen error codes have been triggered and their copy read**
- [ ] Destructive and irreversible actions confirm and say what they will do
- [ ] **No double-submit anywhere** creates a duplicate — codes, trips, cancels, completions
- [ ] Offline is a normal state in the driver app, never an error

### Accessibility and content
- [ ] **WCAG AA contrast across both clients**, including text over maps and `muted-text` on `card`
- [ ] Visible focus rings on web; content descriptions on Android
- [ ] **Web survives 200% zoom; Android survives the largest font scale** — on every screen
- [ ] Touch targets ≥ 48dp Android, ~44 px web
- [ ] **No user-facing string outside `src/strings.ts` or `strings.xml`** — verified by grep
- [ ] Status and state never conveyed by colour alone

### Architecture and verification
- [ ] `domain/` still has no Android imports; **no global service locator** appeared
- [ ] `pg_policies` returns **exactly one row** — ticket 13's `SELECT`-only feed on `track_points` — and nothing else
- [ ] No secret in either client beyond the Supabase URL/anon key and the two render-only map keys
- [ ] Verified on the full device range, both themes-as-shipped, and the largest font scale

## Acceptance Criteria

- [ ] **Force-complete works for `active` trips, requires a reason, and is recorded distinguishably** from a driver-confirmed delivery
- [ ] Force-complete revokes the session and stops tracking; terminal trips return `invalid_transition`
- [ ] **Photos purge at 90 days** alongside the trail; the UI explains a purged photo rather than showing a broken image
- [ ] **All fifteen error codes triggered and reviewed**, with the method recorded in the handoff
- [ ] **Codes reach an arbitrary email address** from a real `humblecoders.in` sender
- [ ] Web deployed to Vercel from `main` and reachable
- [ ] Edge function deploy documented and reproducible from the README alone
- [ ] Android build installs and runs on a clean device
- [ ] **Every UI standard above verified**, with failures fixed or explicitly logged
- [ ] **No secret anywhere in the repo or its history**; secret scanning with push protection enabled
- [ ] `.env.example` complete on both platforms
- [ ] **`pg_policies` returns exactly one row**
- [ ] All existing tests pass
- [ ] **A person who has never seen the project can follow the README from zero to a running system**

## Out of scope

- New features beyond force-complete
- A custom domain — deferred by D-37
- Public Play Store release — excluded by D-30
- Push notifications — PRD **OD-2**, still open
- Vehicle records — PRD **OD-5**, still open
- CI/CD pipelines, monitoring, alerting, analytics
- Load testing, penetration testing, formal audit
- Rewriting or refactoring shipped tickets beyond what the audit requires

## Dependencies

**Tickets 1–14**, all merged. This ticket audits their combined result.
**`humblecoders.in` verified in Resend** — a manager prerequisite, not a development task.

## References

- `docs/PRD.md` §6, §4.7, and D-21, D-30, D-34, D-35, D-36, D-37, D-38
- `CLAUDE.md` in full — this ticket is where it is checked rather than followed
- The acceptance criteria of every ticket from 1 to 14

## Kickoff prompt

```
/start-ticket 15
```

At kickoff, **confirm `humblecoders.in` is already verified in Resend** — DNS propagation takes hours and this is not something to begin on the last afternoon. Get Vercel access, and **take a `pg_dump` before the retention migration**.

Two things to hold onto. Triggering all fifteen error codes is tedious and it is the point of the ticket — copy that has never been seen is copy that has never been checked. And force-complete is an administrative escape hatch on the supervisor's surface, not a way around the geofence for drivers: required reason, visibly marked, rarely used.
