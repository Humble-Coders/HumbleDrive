---
ticket: 2
milestone: M1 Foundation
labels: backend
---

## Story / Why

Ticket 1 gave us a database that no client can reach. Every table has RLS on with zero policies, which means the **only** way in is an Edge Function holding the service role key. This ticket builds that door, once, properly — so that the eleven endpoints that follow inherit authentication, the error contract, and CORS instead of each reinventing them slightly differently.

The thing being protected is real: a supervisor Edge Function holds the service role key, which bypasses every constraint RLS would otherwise apply. If the gate is wrong, the entire security model of the product is wrong. So it gets its own ticket, its own tests, and a working endpoint to prove it end to end.

## Context

Read `docs/PRD.md` §4.6 (API surface) and §4.7 (error contract), and `CLAUDE.md` rules 2, 7 and 9. The error contract is **fixed and closed** — you may not invent a code.

**The auth model, stated plainly.** A supervisor is *not* simply someone with a Supabase Auth account. Anyone can, in principle, end up with an account. A supervisor is someone who has an account **and** an `active = true` row in `admins`. Both checks, in that order, on every supervisor endpoint. This is the whole reason `admins` exists as a separate table rather than a flag on `auth.users`.

**Two-client pattern.** Verifying the caller's JWT and reading the database are done with *different* Supabase clients, and mixing them up is the mistake to avoid:

- An **anon-key client** carrying the caller's `Authorization` header, used only for `auth.getUser()` — this is what proves who the caller is.
- A **service-role client**, used for everything else, which bypasses RLS entirely.

Never use the service-role client to answer "who is calling?", and never trust a `user_id` sent in a request body. The identity comes from the verified JWT and nowhere else.

**Ordering matters.** Handlers run in this order, and `unauthorized` is checked before any database work so an unauthenticated request does nothing and leaks nothing:

1. `OPTIONS` → CORS preflight response, return immediately
2. Method check → `bad_request` if wrong
3. Auth: missing or invalid JWT → `unauthorized`, **with no database call at all**
4. Admin check: valid JWT but no active `admins` row → `not_admin` (one read, unavoidable)
5. Parse and validate the body → `bad_request`
6. Do the work

Note the distinction between `unauthorized` and `not_admin`. They are different situations — "I don't know who you are" versus "I know exactly who you are, and you are not a supervisor" — and the web app shows different copy for each.

**Environment — carried over from ticket 1.** No Docker, no local Supabase stack, and **one Supabase project serving as both dev and production**. Consequences for this ticket:

- `supabase functions serve` is unavailable. The only way to run a function for real is `supabase functions deploy`, roughly a 30-second loop.
- Because of that, **every function is an exported handler with a thin entrypoint**, so `deno test` exercises the logic locally and instantly:

  ```ts
  // handler.ts — pure and testable
  export async function handler(req: Request): Promise<Response> { /* ... */ }

  // index.ts — entrypoint
  import { handler } from "./handler.ts"
  Deno.serve(handler)
  ```

  Most of your verification happens in `deno test`. Deploying is the final check, not the loop.
- Deploying affects the live project. There is no staging. Deploy deliberately.

**Function layout** (manager's call): one folder per endpoint, named exactly as in PRD §4.6, with shared code in `supabase/functions/_shared/`. A folder prefixed with `_` is not deployed as a function, which is what makes `_shared` work.

**CORS** (manager's call): an env-driven allowlist, not `*`. An origin not on the list gets no CORS headers back.

## 🔑 Access & prerequisites

Request from the manager over a secure channel. **Nothing here goes in the repo or in this issue.**

- **Supabase project** URL, anon key, service role key, and the Postgres connection string. Same single project as ticket 1 — it is both dev and production.
- **The first supervisor account**: an email and password for a real Supabase Auth user with a matching `active` row in `admins`. Ticket 1's README documents how to create one; ask the manager to create it, or to confirm you may. You cannot test `admin-me` without it.
- **A second Auth user with no `admins` row**, to test the `not_admin` path. Create a throwaway one yourself.
- **`ALLOWED_ORIGINS`** — the manager confirms the value. Expect `http://localhost:5173` for now, with the production domain appended at ticket 15.
- **Supabase CLI** linked to the project, and **Deno** installed locally for `deno test`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically — you do not set those. `ALLOWED_ORIGINS` you do:

```bash
supabase secrets set ALLOWED_ORIGINS="http://localhost:5173"
```

## Scope

**1. `supabase/functions/_shared/`**

- **`cors.ts`** — reads `ALLOWED_ORIGINS` (comma-separated), echoes the request's `Origin` back only if it is on the list, handles the `OPTIONS` preflight, and exposes the headers other modules attach to every response.
- **`errors.ts`** — the closed set of codes from PRD §4.7 as a TypeScript union type, a helper that builds an error `Response`, and the code-to-status mapping below. The union type is what stops a later ticket inventing a code: an unknown string won't compile.

  | Code | HTTP |
  |---|---|
  | `bad_request` | 400 |
  | `unauthorized` | 401 |
  | `not_admin` | 403 |
  | `not_found` | 404 |
  | `driver_inactive`, `driver_busy`, `invalid_transition` | 409 |
  | `places_failed`, `routes_failed`, `email_failed` | 502 |

  Error body is exactly `{ "error": "<code>", "message": "<plain English>" }`. Success responses return their payload directly with status 200. No `{ ok: true }` wrapper — it adds a layer every client then has to unwrap.
- **`supabase.ts`** — factories for the two clients described above. The service-role factory must be impossible to confuse with the caller-scoped one; name them unambiguously (`serviceClient()` / `callerClient(req)`).
- **`auth.ts`** — `requireAdmin(req)`, returning either the supervisor's `{ userId, name }` or an error `Response`. This is the gate, and it is the most important file in the ticket.
- **`http.ts`** — a small wrapper that composes CORS + method check + error handling around a handler, so each endpoint's `handler.ts` contains only its own logic.

**2. `supabase/functions/admin-me/`**

`index.ts` + `handler.ts`. `GET`, requires a supervisor, returns `{ userId, name }`. Ticket 3's login screen calls this to confirm a signed-in user is an authorised supervisor.

**3. Tests — `supabase/functions/_shared/*.test.ts` and `admin-me/handler.test.ts`**

Run with `deno test`. Because `requireAdmin` is the thing under test, inject the admin lookup as a dependency so it can be faked — no network, no database, no Supabase project needed to run the suite. Cover: no header, malformed header, valid JWT with no `admins` row, valid JWT with `active = false`, valid supervisor, wrong HTTP method, allowed origin, disallowed origin, preflight.

**4. Documentation**

Add to the README: how to deploy a function, how to run `deno test`, how to set a secret, and the error-code table. Keep it to commands that actually work without Docker.

## Acceptance Criteria

- [ ] A request with **no** `Authorization` header returns `unauthorized` / 401 and makes **zero** database calls (prove it — a fake lookup that throws if called is a clean way)
- [ ] A malformed or expired JWT returns `unauthorized` / 401
- [ ] A valid JWT whose user has no `admins` row returns `not_admin` / 403
- [ ] A valid JWT whose `admins` row has `active = false` returns `not_admin` / 403
- [ ] A valid supervisor gets 200 and their `{ userId, name }`
- [ ] The identity comes from the verified JWT only; a `user_id` in the request body is ignored entirely
- [ ] `admin-me` rejects `POST` with `bad_request` / 400
- [ ] `OPTIONS` preflight returns 204 with correct CORS headers for an allowed origin
- [ ] A disallowed origin receives **no** `Access-Control-Allow-Origin` header
- [ ] Every error response is exactly `{ error, message }` with the status from the table above
- [ ] The error-code union type rejects an invented code at compile time — demonstrate with a commented-out line or a type test
- [ ] `deno test` passes with no network access and no Supabase credentials present
- [ ] `admin-me` is deployed and verified against the real project with both a supervisor and a non-supervisor account
- [ ] No function reads a table directly other than `admins`; nothing bypasses `requireAdmin`
- [ ] `git grep` finds no key, token, JWT or project URL anywhere in the repo
- [ ] README documents deploy, test, and secret-setting with no Docker-dependent command

## Out of scope

- **The driver session guard** — written in ticket 9 alongside `driver-verify`, the first thing that issues a token. Do not write speculative driver middleware now.
- All eleven remaining endpoints
- Rate limiting — introduced in ticket 4, where the billed Google APIs make it matter
- Any web or Android code
- CI

## Dependencies

**Ticket 1** must be merged: the schema, `admins`, RLS with zero policies, and the documented first-supervisor procedure.

## References

- `docs/PRD.md` §4.6 API surface, §4.7 error contract
- `CLAUDE.md` — rules 2, 7, 9 and Data & security
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Auth with Edge Functions](https://supabase.com/docs/guides/functions/auth)

## Kickoff prompt

```
/start-ticket 2
```

At kickoff, ask the manager for the Supabase credentials, the first supervisor's login, and the `ALLOWED_ORIGINS` value, all over a secure channel.

Two things to hold onto while building: `unauthorized` must be reachable without touching the database, and the service-role client must never be used to decide who the caller is. Everything else in this ticket is ordinary code.
