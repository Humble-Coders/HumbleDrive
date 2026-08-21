# Handoff — Ticket 2

**Ticket:** [#2 · T2 · Edge Function foundation + supervisor auth gate](https://github.com/Humble-Coders/HumbleDrive/issues/2)
**Branch:** `ticket-2-edge-function-foundation`
**Commits:** `68bb866` (foundation + tests), `52a4aeb` (deploy config + D-39 finding)

## Summary

Ticket 1 left a database with RLS on and zero policies, reachable only by a function
holding the secret key. This ticket builds that door once, so the endpoints in tickets
4–14 inherit authentication, the error contract and CORS instead of each reinventing
them. `_shared/auth.ts` is the gate: the caller's JWT is verified first, then an active
`admins` row is required, because a Supabase Auth account is not a supervisor. Two
Supabase clients are exposed and named so they cannot be confused — `callerClient(req)`
proves identity and does nothing else, `serviceClient()` reads data and bypasses RLS.
The closed error contract from PRD §4.7 is encoded as a TypeScript union with an
exhaustive status map, so an invented code and a code missing a status both fail
`deno check` rather than review. `admin-me` is deployed and verified against the live
project with both a supervisor and a non-supervisor account.

36 tests pass under `--deny-net --cached-only` with every Supabase variable unset.

## Files changed

### Edge function foundation — `supabase/functions/_shared/`

| File | Why |
|---|---|
| `errors.ts` | PRD §4.7 as a union type, the code→status map, and the `{ error, message }` builder. The union is what stops a later ticket inventing a code |
| `cors.ts` | Env-driven origin allowlist, never `*`. Reads `ALLOWED_ORIGINS` per request; unset allows nothing |
| `supabase.ts` | `callerClient(req)` and `serviceClient()`, plus `realAuthDeps()` wiring the live lookups. No generic `createClient` is exported |
| `auth.ts` | `requireAdmin(req, deps)` — the gate. Both lookups injected, so the file imports no Supabase client |
| `http.ts` | Composes preflight, method check and the catch-all around a handler, and attaches CORS to every response |

### The endpoint — `supabase/functions/admin-me/`

| File | Why |
|---|---|
| `handler.ts` | `GET`, requires a supervisor, returns their identity. Dependencies are a required parameter with no default |
| `index.ts` | Entrypoint. The only file here that touches real infrastructure |

### Tests

| File | Why |
|---|---|
| `_shared/auth.test.ts` | The gate: header parsing, both 401 paths, both 403 paths, success, and body-`user_id` rejection |
| `_shared/errors.test.ts` | Status per code, exact body shape, and the compile-time proof the vocabulary is closed |
| `_shared/cors.test.ts` | Allowlist parsing, exact-match origins, `Vary`, preflight, and the no-header case |
| `admin-me/handler.test.ts` | The deployed composition — `withHttp(makeHandler(…))` — end to end |

### Config and docs

| File | Why |
|---|---|
| `supabase/functions/deno.json` | Tasks (`test`, `test:offline`, `check`, `lint`, `fmt`), import map, fmt/lint config |
| `supabase/functions/deno.lock` | Pins the dependency graph so `--cached-only` is reproducible |
| `supabase/config.toml` | `verify_jwt = false` for `admin-me`, so our gate answers rather than the platform's. No `project_id`, deliberately |
| `README.md` | New Edge Functions section: layout, tests, deploy, secrets, error table, tooling note |
| `docs/PRD.md` | Adds `internal_error` to §4.7 |
| `CLAUDE.md` | Adds `internal_error` to rule 7 |

## How to test

**Local — no project, no credentials needed:**

```bash
cd supabase/functions
deno task test          # 36 tests
deno task test:offline  # same, with --deny-net --cached-only
deno task check && deno task lint
```

To reproduce the "no credentials" claim exactly:

```bash
env -u SUPABASE_URL -u SUPABASE_SECRET_KEY -u SUPABASE_SERVICE_ROLE_KEY \
    -u SUPABASE_PUBLISHABLE_KEY -u SUPABASE_ANON_KEY -u SUPABASE_DB_URL \
    deno task test:offline
```

**Against the deployed function.** Get a token with the password grant, then:

| Request | Expected |
|---|---|
| `GET` with supervisor JWT | 200 `{ user_id, name }` |
| `GET` with non-admin JWT | 403 `not_admin` |
| `GET` with no `Authorization` | 401 `unauthorized` |
| `GET` with a garbage token | 401 `unauthorized` |
| `POST` with supervisor JWT | 400 `bad_request` |
| `OPTIONS` from `http://localhost:5173` | 204 + `Access-Control-Allow-Origin` |
| `OPTIONS` from any other origin | 204, **no** `Access-Control-Allow-Origin` |

All seven were run against the live project and matched, both before and after the
final redeploy.

Test accounts exist in the project: `test+supervisor@humblecoders.in` (active `admins`
row) and `test+notadmin@humblecoders.in` (no row, by design). Passwords were handed over
separately and are in no file here.

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | No `Authorization` header → 401, zero database calls | ✅ Proved by fakes that throw if called, in both `auth.test.ts` and `handler.test.ts` |
| 2 | Malformed or expired JWT → 401 | ✅ Unit-tested and confirmed live with a garbage token |
| 3 | Valid JWT, no `admins` row → 403 `not_admin` | ✅ Unit-tested and confirmed live |
| 4 | `admins` row with `active = false` → 403 | ✅ Unit-tested |
| 5 | Valid supervisor → 200 with their identity | ✅ Live: `{ "user_id": "d573c1a2…", "name": "Test Supervisor" }`. See deviation 1 on the key name |
| 6 | Identity from the JWT only; body `user_id` ignored | ✅ There is no code path that reads it; asserted in `auth.test.ts` |
| 7 | `POST` → 400 `bad_request` | ✅ Unit-tested and confirmed live |
| 8 | `OPTIONS` → 204 with correct CORS for an allowed origin | ✅ Confirmed live |
| 9 | Disallowed origin gets no `Access-Control-Allow-Origin` | ✅ Confirmed live, on success, error and preflight responses |
| 10 | Every error body exactly `{ error, message }` with the mapped status | ✅ `errors.test.ts` asserts the key set and status for all 11 mapped codes |
| 11 | The union rejects an invented code at compile time | ✅ A live `// @ts-expect-error`, not a commented-out line — see deviation 5 |
| 12 | `deno test` passes with no network and no credentials | ✅ `deno task test:offline`, 36 passed |
| 13 | Deployed and verified with supervisor and non-supervisor accounts | ✅ Both accounts, seven requests |
| 14 | No function reads a table other than `admins`; nothing bypasses `requireAdmin` | ✅ `admins` is the only table named in the diff; `admin-me` calls `requireAdmin` first |
| 15 | `git grep` finds no key, token, JWT or project URL | ✅ Swept for JWTs, `sb_secret_`/`sb_publishable_`, project refs, `.supabase.co` hosts, connection strings and the test passwords. No hits |
| 16 | README documents deploy, test and secrets with no Docker-dependent command | ✅ New Edge Functions section |

## Deviations / decisions

1. **The wire uses `user_id`, not `userId`.** The ticket says `{ userId, name }` twice;
   `CLAUDE.md` requires snake_case in JSON across the API boundary. Since this is the
   first payload and it sets the pattern for thirteen endpoints, the convention won.
   Internally the type stays camelCase. **Ticket 3 must read `user_id`.**

2. **`internal_error` (500) added to the contract.** An unhandled exception had nowhere
   to go: every existing code blames the caller or a named third party. Added to PRD §4.7
   and `CLAUDE.md` rule 7 in this change, as rule 7 requires. It is never raised
   deliberately, and the underlying error is logged server-side and never returned —
   `handler.test.ts` asserts a thrown message naming a database host does not reach the
   caller.

3. **Driver codes are declared, their statuses are not.** `DriverErrorCode` is in
   `errors.ts` so the closed set lives in one file, but only supervisor and platform codes
   are in `ERROR_STATUS`. Assigning statuses to codes nothing yet emits would be guessing;
   ticket 9 maps them alongside the endpoints that raise them.

4. **`supabase/config.toml` with `verify_jwt = false`** — not mentioned in the ticket.
   Left on, the platform's JWT gate answers before our code in its own body shape, which
   breaks the error contract, and breaks CORS preflight outright since `OPTIONS` carries no
   `Authorization` header. This weakens nothing: `requireAdmin` verifies the JWT *and*
   requires an active `admins` row. **Every future function needs an entry here.**

5. **The compile-time proof is an active assertion.** The ticket offered a commented-out
   line; a comment cannot fail. `// @ts-expect-error` fails the type-check if the union
   ever loosens, because the expected error would stop occurring.

6. **No separate `http.test.ts`.** `admin-me/handler.test.ts` exercises
   `withHttp(makeHandler(…))`, the actual deployed composition, which covers the method
   check and CORS headers without a second file.

7. **D-39: the runtime does not inject the current key names.** Measured with a
   throwaway probe that reported variable *names* only, was gated behind `requireAdmin`,
   and was deleted immediately after:

   ```
   SUPABASE_URL               yes
   SUPABASE_ANON_KEY          yes     SUPABASE_PUBLISHABLE_KEY   no
   SUPABASE_SERVICE_ROLE_KEY  yes     SUPABASE_SECRET_KEY        no
   ```

   `supabase.ts` therefore tries the current name first and falls back to the legacy one.
   Today the fallback is the live path. Our own naming still follows D-39.

8. **Tooling.** The Supabase CLI's Homebrew tap has no bottle for this macOS version and
   building it needs newer Command Line Tools than are installed, so it is the official
   prebuilt binary in `/opt/homebrew/bin`. `brew upgrade` will not update it; the README
   documents the three commands to re-run.

## Open questions / follow-ups

- **A real supervisor account is still needed.** The two accounts here are `test+` prefixed
  verification accounts living in the production project. Ticket 3 should get a properly
  named one.
- **`ALLOWED_ORIGINS` is `http://localhost:5173` only.** The Vercel domain must be appended
  at ticket 15 (D-37), or the deployed web app gets no CORS headers.
- **Driver error codes need statuses at ticket 9**, and the driver session guard belongs
  there too — deliberately not written speculatively here.
- **Remove the legacy key fallback** in `supabase.ts` once the Edge runtime injects
  `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`.
- **Rate limiting** arrives in ticket 4, where the billed Google APIs make it matter.
- **`verify_jwt = false` must be repeated** in `config.toml` for every function added from
  here on. It is easy to forget and the failure mode — a platform-shaped error body — will
  look like a client bug.
