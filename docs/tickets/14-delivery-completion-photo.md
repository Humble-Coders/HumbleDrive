---
ticket: 14
milestone: M6 Completion & release
labels: backend,android,web
---

## Story / Why

Every run so far has no ending. A driver reaches the destination, and the app has nothing for them to tap — the trip sits `active` forever and the foreground service keeps tracking a vehicle that has already arrived.

This ticket closes the loop: the driver confirms delivery at the destination with a photo, the trip becomes `completed`, tracking stops, and the supervisor can see the proof. It is the last feature ticket; after it, only hardening and deployment remain.

## Context

Read `docs/PRD.md` §5.6, §4.5 and decision **D-7**, plus `CLAUDE.md` rules 1 and 7. Tickets 11 and 12 built the tracking this ticket must shut down cleanly.

### `completed` is terminal, and terminal means terminal

`active → completed` is a one-way door. Once through it:

- The session token is revoked (**D-26**: sessions expire with their trip)
- The foreground service stops and the notification is dismissed
- Further calls to `driver-track`, `driver-stop-event` or `driver-complete` return `trip_completed`
- Nothing reopens the trip. There is no "undo delivery"

A service still running after completion is a defect, not an inefficiency — it drains battery and it breaks the privacy promise ticket 11's rationale screen made to the driver.

### The photo is proof, which drives three decisions

**Camera only. No gallery.** A gallery pick could be any image from any day, which quietly turns proof into decoration. Camera-only is what makes the timestamp and location recorded alongside it mean something.

**Downscaled to roughly 1600 px at ~70% JPEG**, landing around 300–600 KB. That is plenty to read a doorway, a gate number or a signed slip, and it uploads over patchy rural data in seconds rather than minutes — at exactly the moment a driver wants to finish and go home. **Strip EXIF**, including any embedded location: we record position separately and deliberately, and duplicating it in metadata we do not control is worse than not having it.

**Private bucket, signed URLs.** The bucket is not public. The supervisor's browser gets a short-lived signed URL generated server-side; a raw object URL without a signature must be refused.

### Completion is geofenced — and this needs care

**Manager's decision: completion requires the driver to be within ~200 m of the destination.**

This is workable because ticket 11's foreground service is already producing a fix every 5 seconds while the trip is `active`. **Use the service's most recent fix** rather than requesting a fresh one — it is already there, it is already accurate, and a fresh request adds a wait at the worst moment.

Two guards are required so the gate does not strand anyone:

- **Staleness** — if the most recent fix is older than ~60 s, treat position as unknown rather than trusting it
- **Accuracy** — if the fix's accuracy is worse than ~100 m, treat position as unknown. A 500 m accuracy reading "within 200 m" is meaningless

When position is unknown or the driver is outside the radius, the screen must say **specifically** what is wrong — "waiting for a GPS fix", or "you appear to be 1.2 km from the destination" — never a bare disabled button. A driver who cannot tell why they are blocked will assume the app is broken.

**Known limitation, deliberately accepted:** a driver in a covered loading bay or urban canyon may be unable to get a usable fix, and there is no in-app override and no way for a supervisor to complete a trip on their behalf. The escape hatch today is the supervisor cancelling the run. If this bites in practice, the fix is a supervisor-side force-complete, which is **not** in this ticket.

### Completion records where, not just when

The migration adds `completed_lat`, `completed_lng` and `completed_accuracy_m`, so the record shows where delivery was confirmed. This is what makes the geofence auditable rather than merely restrictive.

### Uploads must survive a bad connection

The photo is captured, downscaled, and **written to local storage before any upload attempt**, with the upload retried on failure — the same acknowledge-then-delete discipline as ticket 11's location queue. A driver at a rural destination on one bar must not lose the photo, and must not be trapped on a screen that cannot proceed.

### Manager's decisions

1. **No design provided** — brand kit and existing primitives on both platforms
2. **Camera only**, no gallery
3. **Downscale to ~1600 px, ~70% JPEG**, EXIF stripped
4. **Completion gated within ~200 m** of the destination

### Environment

No Docker, one Supabase project serving as both dev and production. Storage buckets are created in the Supabase dashboard or by migration — coordinate with the manager rather than guessing.

## 🔑 Access & prerequisites

- Supabase credentials; supervisor login; Android `local.properties` from ticket 9
- **A private Storage bucket** for delivery photos — ask the manager to create it, or to confirm you may. Confirm its name; do not invent one
- **A real device and an `active` trip you can physically take to its destination** — the geofence cannot be tested from a desk. Plan a short route to somewhere you can actually stand
- A trip you can attempt to complete **from far away**, to verify the gate blocks it
- **Confirmation that tickets 12 and 13 are merged**

## Scope

**1. Migration**

- `trips`: `completed_lat`, `completed_lng`, `completed_accuracy_m`
- Private Storage bucket for delivery photos, with **no public read policy**
- Update `schema.sql`; RLS unchanged

**2. `supabase/functions/driver-complete/`**

Requires a driver session. Accepts the photo and the completion position.

- Rejects anything other than `active` with `trip_completed` or `trip_cancelled`
- **Validates the server-side distance from the destination** — the client gate is a courtesy; this is the guarantee (`CLAUDE.md` rule 1). Outside the radius is `bad_request` with a clear message
- Rejects a missing photo as `bad_request` — completion without proof is not allowed (D-7)
- Stores the photo, sets `pod_photo_path`, `completed_at` and the completion position, moves the trip to `completed`, and **revokes the session**
- **Idempotent** — a retry after a lost response must not create a second photo or error confusingly

**3. `trips-detail` — extended**

Returns a **short-lived signed URL** for the photo, plus the completion position and time. Never a raw object path the browser could use unsigned.

**4. Android — completion flow**

- A Complete action on the active run screen, enabled only when a fresh, accurate fix places the driver within ~200 m
- **Specific blocked-state messaging** as described above — never a bare disabled button
- Camera capture, downscale, EXIF strip, local persistence, then upload with retry
- On success: terminal confirmation screen, **service stopped**, notification dismissed, session cleared
- On failure: the photo is kept and retryable; the driver is never stuck

**5. Web — proof display**

On the trip detail page: the photo, when and where delivery was confirmed, and the completion position on the map alongside the trail from ticket 13.

**6. Tests**

- `deno test`: non-`active` statuses rejected; missing photo rejected; **server-side distance validation rejects a far-away completion**; idempotent retry; the session is revoked; the returned URL is signed and expires
- JVM tests: downscale hits the target size; EXIF is stripped; the photo persists locally before upload and survives a failed attempt; stale and inaccurate fixes are treated as unknown position

## 🖼️ UI standards

Both platforms. Mobile items apply to the Android half; web items to the supervisor half.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] Reuse existing primitives on both platforms; extend in place rather than forking

### Theming
- [ ] **Dark theme only** per PRD D-21 on both platforms — deliberately overriding the usual light+dark requirement
- [ ] Every colour from a token. The photo preview sits on the app's own surface, not a white sheet

### Native components
- [ ] **Android:** the system camera via a standard intent or CameraX — never a hand-rolled capture UI. Material 3 elsewhere
- [ ] **Web:** semantic HTML; the photo in a real `<img>` with meaningful `alt`
- [ ] If something can't be done natively, say so in the PR and use the smallest custom component that works

### Layout, insets and responsiveness
- [ ] **Android:** edge-to-edge; **the Complete button must not sit under the gesture bar**; both orientations; small through large phone
- [ ] **Web:** 375 / 768 / 1280 px+ correct; the photo scales without overflowing and never forces horizontal scroll
- [ ] Long addresses ellipsize cleanly on both platforms

### Input and keyboard
- [ ] No text input on either surface
- [ ] **Complete is large and comfortably spaced** — pressed at the end of a long day, often one-handed
- [ ] Web photo view is keyboard-reachable

### States and feedback
- [ ] **Blocked, ready, capturing, uploading, retrying, completed** are all explicit states
- [ ] **The blocked state names the actual reason** — no fix yet, poor accuracy, or the measured distance
- [ ] Upload shows progress; a failure offers retry and **keeps the photo**
- [ ] Completion is confirmed before it happens — it is irreversible, and the confirmation should say so
- [ ] **A double-tap completes once**
- [ ] Terminal screen makes clear the run is finished and tracking has stopped
- [ ] State survives rotation and process death, including a captured-but-unsent photo
- [ ] Motion subtle; reduce-motion respected

### Accessibility and content
- [ ] Content descriptions on camera and completion controls; the web photo has meaningful `alt`
- [ ] **Font scaling** — the blocked-state explanation holds at the largest supported size
- [ ] Touch targets ≥ **48dp** Android, ~44 px web; **WCAG AA contrast**
- [ ] **No hardcoded user-facing strings** — `strings.xml` on Android, `src/strings.ts` on web

### Architecture and verification
- [ ] MVVM on Android; no business logic in composables or React components
- [ ] The screen **observes** the tracking service; the service is stopped through the same mechanism ticket 11 established
- [ ] Verified on a real device **at a real destination**, both orientations, largest font scale, and on a deliberately weak connection

## Acceptance Criteria

- [ ] Completion requires a photo; there is no path to `completed` without one
- [ ] **Only the camera can supply it** — no gallery picker anywhere
- [ ] Photos land around 300–600 KB with **EXIF stripped**, verified on a real capture
- [ ] The photo is written locally before upload and **survives a failed upload**, remaining retryable
- [ ] **Completing from more than ~200 m away is refused by the server**, not merely hidden by the client
- [ ] A stale (>60 s) or inaccurate (>100 m) fix is treated as unknown position, and the UI says which
- [ ] The blocked state always names the reason; there is never a bare disabled button
- [ ] Completion records `completed_at` and the completion position with accuracy
- [ ] **On completion the service stops, the notification is dismissed, and the session is revoked** — verified by observing the notification disappear and a subsequent `driver-track` call returning `trip_completed`
- [ ] A retry after a lost response does not create a second photo or a confusing error
- [ ] The supervisor sees the photo via a **signed URL that expires**; a raw object URL is refused
- [ ] Completion position appears on the trip detail map alongside the trail
- [ ] `completed` is terminal — no path reopens it
- [ ] Every UI standard above is met
- [ ] `deno test` and JVM tests pass with no network
- [ ] **Verified end to end at a real destination on a real device**

## Out of scope

- **Supervisor force-complete.** The geofence's known limitation is accepted for now; if it bites, that is its own ticket
- Receiver signature capture — considered and not chosen for v1
- Multiple photos per delivery. One photo, one delivery
- Photo annotation, cropping, or editing
- Reopening or amending a completed trip
- Deleting photos, and photo retention policy. **PRD D-34 covers `track_points` only** — photo retention is not yet decided and should become an open decision if the project continues
- Push notification to the supervisor on completion — PRD **OD-2**, still open

## Dependencies

**Ticket 13** — the trip detail page this extends, and the map the completion position appears on.
**Ticket 12** — the active run screen the Complete action lives on.
**Ticket 11** — the location stream the geofence reads, and the service this must stop.
**Ticket 9** — session handling and revocation.

## References

- `docs/PRD.md` §5.6, §4.5, §4.7, and D-7, D-21, D-26
- `CLAUDE.md` — rules 1 and 7, Data & security
- [Supabase Storage — signed URLs](https://supabase.com/docs/guides/storage/serving/downloads) · [CameraX](https://developer.android.com/media/camera/camerax)

## Kickoff prompt

```
/start-ticket 14
```

At kickoff, ask the manager for the **name of the private Storage bucket** — do not invent one. You also need a trip you can physically take to its destination; the geofence cannot be validated from a desk.

Three things to hold onto. The server validates the distance, not just the client — the button being disabled is a courtesy, the server check is the guarantee. Completion must stop the service and dismiss the notification, because a phone still tracking after delivery breaks the promise the permission screen made. And the blocked state must always say *why*, or a driver standing at the right door will conclude the app is broken.
