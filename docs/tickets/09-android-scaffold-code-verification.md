---
ticket: 9
milestone: M4 Driver app core
labels: backend,android
---

## Story / Why

This is the first line of Android code in the project, and the first time the driver side becomes real. It does two things: it establishes the architecture every later Android ticket is built inside, and it implements the moment a driver enters the system — typing six characters from an email and getting their run back.

Both halves matter. **The architecture is load-bearing**: tickets 10 through 14 all live inside whatever shape is set here, and manual dependency injection done carelessly quietly becomes a global service locator that makes everything after it harder to test. **The code exchange is a credential flow**: a code is single-use, it is redeemed for a session token, and it must be impossible to use twice.

At the end of this ticket a driver types a code and their run appears — cached on the device, readable with the network off.

## Context

Read `docs/PRD.md` §5.5, §4.5, §4.7 and decisions D-15, D-17, D-23, D-24, D-26 to D-28. Read the **Android section of `CLAUDE.md` in full** before writing anything; it is unusually specific and this ticket is where it starts being enforced.

### Architecture, stated so it cannot be drifted from

- **Single `:app` module**, packages `data/` · `domain/` · `ui/` · `service/`. Dependencies point one way: `ui` and `data` may depend on `domain`; `domain` depends on neither and contains **no Android imports at all**
- **MVVM**, one ViewModel per screen, exposing a single `StateFlow<UiState>` where loading, error and content are modelled **explicitly** — not a scatter of `isLoading` booleans
- **Manual DI. No Hilt, no Koin, no annotation processors.** One `AppContainer` built in `Application.onCreate()` owns the long-lived singletons: Room database, Retrofit service, token store, repositories. ViewModels come from an explicit `ViewModelProvider.Factory` taking what it needs from `AppContainer`, used as `viewModel(factory = ...)`
- **`AppContainer` is reachable only through the `Application` instance.** No `object` singleton holding state, no static locator any class can reach. That drift is precisely what makes manual DI get a bad reputation, and it is easy to fall into on ticket 9 and impossible to undo by ticket 14
- **Every dependency is an interface in `domain/`** with its implementation in `data/`, so a ViewModel unit-tests against a fake with no Android runtime

### The code exchange

Six characters from `A-Z2-9` minus `O` and `I`. **Case-insensitive on entry** — a driver reading an email in a cab will type lowercase, and that must work. Uppercase before hashing.

`driver-verify` hashes what it receives, matches it against `pending` trips, and on success:

1. Mints an opaque random session token, stores **only its hash** in `driver_sessions`
2. Returns the token plus the complete run payload

The code is dead after redemption. Reusing it returns `code_already_used`. Note the distinction from `invalid_code`: one is a code that never existed, the other a code that was already spent, and the driver deserves different copy for each.

**The session token expires with its trip** (PRD D-26, resolving former OD-4). When the trip completes or is cancelled, the session is revoked. There is no timer.

**Never log the code or the token**, in the app or the function. Not in a debug build, not behind a flag.

### Offline from the first screen

The full run payload is written to Room at verification, so everything after works with no network. This is not a later optimisation — a driver may verify at a depot with wifi and drive straight into a dead zone. The overview screen in ticket 10 must render entirely from cache.

The session token goes in **`EncryptedSharedPreferences`**, not plain preferences.

### Manager's decisions

1. **No design provided** — build the Compose theme from the same tokens as the web app and design the screen against it. **This ticket establishes the Android visual primitives** that tickets 10 to 14 reuse, so make them good
2. **Retrofit + kotlinx.serialization** (PRD D-27)
3. **Session expires with the trip** (D-26)
4. **Both orientations supported** (D-28) — this meets the standard as written; no deviation

### Environment

No Docker, one Supabase project serving as both dev and production. The Edge Function half follows ticket 2's exported-handler pattern and is verified with `deno test`, then deployed.

## 🔑 Access & prerequisites

- Supabase project URL and **anon key** for the Android app. The service role key must never appear in the APK
- **A `pending` trip with a real code**, created through ticket 7's wizard. You need the actual email, so the driver record must use the address ticket 7's Resend test mode can deliver to
- A second `pending` trip, to test that a redeemed code cannot be reused
- **Confirmation that tickets 2 and 7 are merged and deployed**
- Android Studio, and **a real device or emulator running API 26+**
- **No Google Maps key is needed for this ticket** — no map is drawn until ticket 10

## Scope

**1. `supabase/functions/driver-verify/`**

`POST { code, deviceLabel? }`. **No supervisor auth** — this is the driver's entry point and the only endpoint reachable without an existing credential.

Uppercases and hashes the code, looks for a `pending` trip with that hash. On success mints a token, stores its hash in `driver_sessions`, and returns the token plus the full run payload: route with polyline, ordered stops with type and planned minutes, consignment, driver name, origin and destination, drive duration, break total, total.

Errors: `invalid_code`, `code_already_used`, `trip_cancelled`, `trip_completed`, `bad_request`.

**2. Driver session middleware — `_shared/driverAuth.ts`**

Deferred from ticket 2 on purpose; this is the first ticket where a session can exist. `requireDriverSession(req)` returns the trip and driver, or an error `Response`. Revoked or unknown token → `session_expired`. Tickets 10 to 14 all use it.

**3. Android project — `android/`**

Gradle setup, minSdk 26, Compose, Room, Retrofit, kotlinx.serialization, `EncryptedSharedPreferences`. Package structure and `AppContainer` per the architecture above. Compose theme mirroring the brand tokens, defined once. Supabase URL and anon key injected via build config from a gitignored properties file — **not hardcoded, not committed**.

**4. Code entry screen**

A single field, six characters, case-insensitive. On success the payload is written to Room and the app navigates to a minimal confirmation naming the run's origin and destination. The full overview screen is ticket 10.

Re-opening the app with a live session skips code entry entirely.

**5. Tests**

- `deno test`: code uppercased before hashing; a redeemed code returns `code_already_used`; unknown returns `invalid_code`; cancelled and completed trips return their codes; **no response or log contains the plaintext code or token**
- JVM unit tests on the ViewModel with a fake repository: loading, error and success states; a rejected code leaves the field editable with input intact

## 🖼️ UI standards

Full mobile standards apply — this is a phone app.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply here
- [ ] **Establish the reusable Compose primitives** (button, text field, screen scaffold, error banner) that tickets 10 to 14 will use. Define the theme once; no hardcoded colours in a composable

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Every colour from a theme token, so a future light theme is a config change

### Native components
- [ ] Material 3 components throughout — `TextField`, `Button`, `Scaffold`, `Snackbar`. Do not hand-roll what Compose provides
- [ ] If the design needs something Material can't do, say so in the PR and use the smallest custom composable that works

### Layout, insets and responsiveness
- [ ] **Edge-to-edge**, with the background drawing under the system bars
- [ ] **Safe areas respected** — no content or control under the status bar, notch/cutout, or the Android gesture/navigation bar. Only decorative background bleeds underneath
- [ ] **Both orientations** (D-28), and small phone through large phone
- [ ] **Correct truncation** — a long origin or destination name ellipsizes cleanly rather than clipping or pushing layout

### Input and keyboard
- [ ] Code field uses **`KeyboardOptions` with `characters` capitalisation and `ImeAction.Done`**, and Done submits
- [ ] Autocorrect **off** — a six-character code must not be "corrected"
- [ ] **The field stays visible above the keyboard**; the screen scrolls or insets as needed
- [ ] Keyboard dismisses on submit and on tap-outside
- [ ] Field accepts lowercase and displays uppercase, so what the driver sees matches the email

### States and feedback
- [ ] **Loading, error and disabled** states explicit in the `UiState`. Submit disables and shows progress
- [ ] Every error code gets its own friendly message: `invalid_code`, `code_already_used`, `trip_cancelled`, `trip_completed`, and a plain offline message
- [ ] **Typed input survives a rejected submit** and the field stays editable
- [ ] **State survives rotation and process death** — this is what the ViewModel is for, and D-28 makes rotation a real path
- [ ] Motion subtle; reduce-motion respected

### Accessibility and content
- [ ] Content descriptions on interactive and informative elements; logical focus order
- [ ] **Font scaling** — layout holds at the largest supported font size
- [ ] Touch targets ≥ **48dp**; **WCAG AA contrast** against the dark palette
- [ ] **No hardcoded user-facing strings** — everything through `strings.xml`

### Architecture and verification
- [ ] MVVM as described; **no business logic in composables**; no `Context` or Compose types in a ViewModel
- [ ] Manual DI via `AppContainer`; **no global service-locator singleton**
- [ ] **No secrets in the APK** beyond the Supabase URL and anon key
- [ ] Verified on smallest and largest supported device, both orientations, and the largest font scale

## Acceptance Criteria

- [ ] A valid code returns the full run payload and is written to Room
- [ ] **The same code entered a second time returns `code_already_used`**
- [ ] An unknown code returns `invalid_code`; the two produce different messages
- [ ] Codes for cancelled and completed trips return `trip_cancelled` and `trip_completed`
- [ ] Lowercase entry works identically to uppercase
- [ ] **Only the token hash is stored** in `driver_sessions`; the plaintext token exists only in the response and on the device
- [ ] **No log line in the app or the function contains a code or a token**, in any build type
- [ ] The token is in `EncryptedSharedPreferences`, not plain preferences
- [ ] **After verification, killing the network still shows the cached run** — verified in airplane mode
- [ ] Re-opening the app with a live session skips code entry
- [ ] Verifying while offline shows a clear offline message, not a crash or a generic failure
- [ ] `domain/` contains **no Android imports**; ViewModel tests run on the JVM with no Android runtime
- [ ] **No `object` singleton or static service locator exposes `AppContainer`**
- [ ] Every UI standard above is met
- [ ] `deno test` passes with no network and no credentials
- [ ] `git grep` finds no service role key, no hardcoded Supabase credentials, and no user-facing string outside `strings.xml`

## Out of scope

- **The full run overview screen** — ticket 10. This ticket ends at a minimal confirmation
- Starting a trip (`driver-start`), any map, and all location tracking — tickets 10 and 11
- Break stops, delivery completion, photo upload — tickets 12 and 14
- Push notifications — PRD open decision, out of v1
- Play Store distribution — PRD OD-1, deferred to ticket 15
- Driver accounts, passwords, or self-registration. The code is the entire identity mechanism

## Dependencies

**Ticket 7** — trips with real codes to verify against.
**Ticket 2** — the shared Edge Function foundation this extends with driver auth.
**Ticket 1** — `trips`, `driver_sessions`, and the code-hash column.

## References

- `docs/PRD.md` §5.5, §4.5, §4.7, and D-15, D-17, D-23, D-24, D-26, D-27, D-28
- `CLAUDE.md` — the Android section in full, plus rules 8 and 9
- Ticket 7 for how codes are generated and hashed

## Kickoff prompt

```
/start-ticket 9
```

At kickoff, ask the manager for the Supabase URL and anon key, and for a real `pending` trip whose code you can actually receive by email — ticket 7's Resend test mode delivers to one address only.

Three things to hold onto. `AppContainer` must stay reachable only through the `Application`, because a static locator added here is unpickable by ticket 14. The code is single-use and must be provably so. And the cached run has to render with the network off, because that is the situation this app exists for.
