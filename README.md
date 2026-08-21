# Humble Drive

A two-platform consignment dispatch system. A **supervisor** plans a delivery
run on a web dashboard — source, destination, driver rest stops — assigns it
to a driver, and emails a one-time code. The **driver** enters that code in an
Android app, drives the route, takes their breaks, and closes the run with a
photo at the destination.

- **Spec:** [docs/PRD.md](docs/PRD.md) — its Decision Log is binding
- **Architecture rules:** [CLAUDE.md](CLAUDE.md) — not suggestions
- **How we work:** [docs/PROCESS.md](docs/PROCESS.md)

## Layout

```
web/                  Vite + React + TS + Tailwind admin app   (ticket 3)
android/              Kotlin + Compose driver app              (ticket 9)
supabase/
  schema.sql          readable reference — never applied
  migrations/         forward-only, hand-written, the real history
  tests/              pgTAP constraint tests
  functions/          Deno edge functions — the entire API surface
    _shared/          auth gate, error contract, CORS, clients
docs/                 PRD, PROCESS, ticket drafts
handoffs/             finished-ticket reports
```

## Two things to know before you touch anything

**There is no Docker and no local Supabase stack.** So `supabase start`,
`db reset`, `test db`, `db diff` and `functions serve` are all unavailable.
Don't reach for them.

**There is one Supabase project and it is also production.** It is empty
today, which makes this the safest moment it will ever be. Treat it as
production from the start and the transition costs nothing:

- Every pgTAP file ends in `rollback`. A file without one is a defect even
  if it passes
- No reset, drop or truncate script is ever committed
- `schema.sql` is never applied — it is the reference, migrations are the
  mechanism
- Prefix test data so it can be told apart later: `test+alice@humblecoders.in`

## Setup from zero

**1. Tools**

```bash
brew install supabase/tap/supabase libpq
```

`psql` comes from `libpq`; add it to your `PATH` if `which psql` finds nothing.

**2. Credentials**

```bash
cp .env.example .env
```

Fill it from the Supabase dashboard:

| Variable | Where |
|---|---|
| `VITE_SUPABASE_URL` | Project Settings → API keys |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API keys |
| `SUPABASE_DB_URL` | **Connect** button in the top bar → **Session pooler** → URI |
| `SUPABASE_SECRET_KEY` | Project Settings → API keys → create a secret key (ticket 2 onward) |

**Use the session pooler, not the direct connection.** Direct connections are
IPv6-only, so `psql` fails from most networks. You can tell them apart at a
glance: the pooler username is `postgres.<project-ref>`, and the host ends in
`pooler.supabase.com`.

**Avoid `@ # / : ?` in the database password.** Each has meaning inside a
connection URI, and avoiding them is simpler than percent-encoding.

`.env` is gitignored. Nothing in it is ever committed.

**3. Link the CLI**

```bash
supabase link --project-ref <your-project-ref>
```

**4. Apply migrations**

```bash
supabase db push
```

If that reports `Access token not provided` — the CLI occasionally loses
keychain access mid-session — apply directly instead and record the version
yourself so history stays accurate:

```bash
set -a; . ./.env; set +a
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
psql "$SUPABASE_DB_URL" -c "insert into supabase_migrations.schema_migrations (version, name) values ('<timestamp>', '<name>') on conflict do nothing;"
```

**5. Run the tests**

```bash
set -a; . ./.env; set +a
psql "$SUPABASE_DB_URL" -f supabase/tests/constraints.test.sql
```

21 assertions, all inside a transaction that is rolled back. Nothing survives
the run — verify with row counts if you want to be sure.

## Creating the first supervisor

A Supabase Auth account is **not** a supervisor. An active row in `admins` is
what makes one, and both are required.

1. Dashboard → Authentication → Users → **Add user**, with a real email and
   password. Copy the resulting user ID
2. Then:

```bash
set -a; . ./.env; set +a
psql "$SUPABASE_DB_URL" -c "insert into admins (user_id, name) values ('<user-id>', '<Name>');"
```

**No credentials go in this repo.** Not in a seed file, not in a script.

## Edge Functions

Clients never touch the database. Every read and write goes through a function
holding the Supabase **secret key**, which bypasses RLS entirely — so each one
authenticates the caller itself. `_shared/auth.ts` is that gate.

```
supabase/functions/
  _shared/
    errors.ts     the closed error contract from PRD §4.7, as a union type
    cors.ts       env-driven origin allowlist — never `*`
    supabase.ts   callerClient(req) and serviceClient(), deliberately distinct
    auth.ts       requireAdmin(req, deps) — the supervisor gate
    http.ts       CORS + method check + error handling around a handler
  admin-me/
    handler.ts    the logic, taking its dependencies as a parameter
    index.ts      the entrypoint: Deno.serve(...)
```

**Every function is a handler plus a thin entrypoint.** There is no local
Supabase stack, so `functions serve` is unavailable and the only way to run a
function for real is to deploy it — roughly a 30-second loop against the live
project. Splitting them means `deno test` exercises the logic instantly, and
deploying is the final check rather than the inner loop.

Dependencies are passed to `handler.ts` as a required parameter with no
default. That keeps the Supabase client out of the tested files, which is what
lets the suite run with no network and no credentials.

### Tests

```bash
cd supabase/functions
deno task test
```

Run from `supabase/functions` — that is where `deno.json` lives.

`deno task test:offline` adds `--deny-net --cached-only`, proving the suite needs
neither the network nor a Supabase project. Also available: `deno task check`
(types), `deno task lint`, `deno task fmt`.

### Deploying

```bash
supabase link --project-ref <your-project-ref>   # once per machine
supabase functions deploy admin-me
```

There is no staging. A deploy is live — deploy deliberately.

### Secrets

`SUPABASE_URL` and the key variables are injected into functions automatically.
Anything else is set by hand and is never committed:

```bash
supabase secrets set ALLOWED_ORIGINS="http://localhost:5173"
supabase secrets list
```

`ALLOWED_ORIGINS` is a comma-separated allowlist. An origin that is not on it
gets no CORS header back at all. **Unset means nothing is allowed** — it fails
closed, so a forgotten secret breaks dev loudly instead of quietly allowing
every origin in production.

### The error contract

Fixed and closed (PRD §4.7). Every response body is exactly
`{ "error": "<code>", "message": "<plain English>" }`. Success payloads come
back bare, with no wrapper. **Adding a code means updating PRD §4.7, `CLAUDE.md`
rule 7 and `errors.ts` in the same change** — the union type will not compile
otherwise, which is the point.

| Code | HTTP | Meaning |
|---|---|---|
| `bad_request` | 400 | Malformed input, or the wrong HTTP method |
| `unauthorized` | 401 | No valid JWT. Checked first, before any database call |
| `not_admin` | 403 | Valid account, but no active `admins` row |
| `not_found` | 404 | No such record |
| `driver_inactive` | 409 | Driver is deactivated |
| `driver_busy` | 409 | Driver already holds a live run |
| `invalid_transition` | 409 | Trip is not in a state that allows this |
| `internal_error` | 500 | Unhandled failure on our side. Logged, never explained |
| `places_failed` | 502 | Google Places did not answer |
| `routes_failed` | 502 | Google Routes did not answer |
| `email_failed` | 502 | Resend did not accept the message |

Driver-facing codes — `invalid_code`, `code_already_used`, `trip_cancelled`,
`trip_completed`, `session_expired` — are declared in `errors.ts` but get their
statuses in ticket 9, alongside the endpoints that raise them.

### Tooling note

`deno` comes from `brew install deno`. The Supabase CLI does **not**: its tap has
no bottle for this macOS version, and building it from source needs newer
Command Line Tools than are installed. It is instead the official prebuilt
binary, dropped into `/opt/homebrew/bin`:

```bash
gh release download --repo supabase/cli --pattern 'supabase_*_darwin_arm64.tar.gz'
tar -xzf supabase_*_darwin_arm64.tar.gz
install -m 755 supabase /opt/homebrew/bin/supabase
```

Because Homebrew does not track it, `brew upgrade` will not update it. Repeat
those three commands to upgrade.

## Adding a migration

1. Write the SQL by hand into `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`
   — `supabase db diff` needs Docker and is unavailable
2. Update `supabase/schema.sql` to match
3. **Back up first if the migration drops or alters a column.** The free tier
   has no automatic backups:

```bash
set -a; . ./.env; set +a
pg_dump "$SUPABASE_DB_URL" > backup-$(date +%F).sql
```

4. Apply it, and add tests for any new constraint

## What the database guarantees

These are Postgres constraints, not API conventions. Anything relaxed here
silently breaks something downstream — see `CLAUDE.md` rule 1.

- Driver emails are lowercase and trimmed, enforced by a check constraint
- A driver holds at most **one** `pending` or `active` trip, enforced by a
  partial unique index
- Stop order is unique per route; one stop event per `(trip, stop)`
- `planned_minutes` cannot be negative
- Deleting a trip cascades to its sessions, stop events and track points;
  deleting a route cascades to its stops
- `track_points.recorded_at` (device clock) is required and is **always** what
  trails are ordered by. `received_at` (server clock) is set automatically and
  can be hours later
- RLS is on with **zero policies**, and `anon`/`authenticated` hold no table
  privileges. Everything reaches the database through an Edge Function holding
  the secret key
