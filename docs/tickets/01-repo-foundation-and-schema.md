---
ticket: 1
milestone: M1 Foundation
labels: infra
---

## Story / Why

Humble Drive has a PRD and a set of architecture rules, but no code and no database. Everything else in the project — every Edge Function, both clients — depends on a schema whose invariants are already correct, because those invariants are the product's safety guarantees and they are **enforced in Postgres, never in the UI**.

This ticket lays the monorepo skeleton and lands the database with every constraint in place and proven by tests. Nothing renders at the end of it. What you get instead is a database that cannot be talked into an invalid state by any later ticket.

## Context

**What this project is.** A supervisor plans a delivery run on a web dashboard, assigns it to a driver, and emails a one-time code. The driver enters that code in an Android app, drives the route, takes rest stops, and closes the run with a photo. Read `docs/PRD.md` end to end before starting — its Decision Log is binding. Read `CLAUDE.md`; its architecture rules are not suggestions.

**Two decisions worth internalising before you write SQL:**

1. **The database is the enforcement layer.** One active run per driver, single-use codes, lowercase driver emails, and stop ordering are Postgres constraints. A later ticket disabling a button is a UX hint, not a guarantee. If you find yourself thinking "the API will prevent that", the constraint is missing.

2. **Intermediate stops are driver rest, food, and fuel breaks — not delivery points.** Nothing is loaded or unloaded at a stop. This is the most commonly misread part of the domain (PRD D-3). A stop has a type and a planned duration, and that is all.

**Environment — read this twice.** There is **no Docker** on this project and **no local Supabase stack**. There is also **one single hosted Supabase project**, which serves as both development and production. Everything you do lands on the same database everyone else uses.

Right now that database holds nothing, so the risk is theoretical. It stops being theoretical the day the first real driver run is recorded. Treat it as production from day one and the transition costs you nothing.

Four consequences you must respect:

1. **`supabase start`, `supabase db reset`, `supabase test db`, `supabase db diff` and `supabase functions serve` all require Docker and are unavailable.** Do not put any of them in the README or in a script.
2. **Every pgTAP test file must be wrapped in a transaction that is rolled back.** This is what makes a single shared database safe, and it is non-negotiable:

   ```sql
   begin;
   select plan(4);
   -- attempt the bad inserts, assert they are rejected
   select * from finish();
   rollback;
   ```

   A test file without a closing `rollback` is a defect, regardless of whether it passes.
3. **Never commit a reset, drop, or truncate script.** No `reset.sql`, no "rebuild from scratch" helper. Convenient with a throwaway database, catastrophic with this one.
4. **`schema.sql` is never re-run against the live database.** It is the readable reference for what the schema should be. Actual changes are forward-only migrations.

**Test data must be identifiable.** Since experiments share the database with real records, prefix anything fake so it can always be told apart and removed — driver emails as `test+alice@humblecoders.in`, and similar.

**Migrations.** `supabase/schema.sql` is the human-readable source of truth for the whole schema. `supabase/migrations/` holds timestamped files that are the actual applied history, applied with `supabase db push`. Because `supabase db diff` needs Docker, **migrations are hand-written** — write the SQL yourself into `supabase/migrations/<timestamp>_name.sql`. This ticket produces both files, consistent with each other. Every later ticket adds a migration and updates `schema.sql` to match.

**Back up before anything structural.** The Supabase free tier includes no automatic backups, so before applying any migration that drops or alters a column:

```bash
pg_dump "$DB_URL" > backup-$(date +%F).sql
```

**A note for tickets 2 onward** (worth knowing now, since it shapes the README): without `supabase functions serve`, the only way to run an Edge Function is to deploy it, roughly a 30-second loop. So functions are written as an exported handler with a thin entrypoint, letting `deno test` exercise the logic locally with no server:

```ts
// handler.ts — pure and testable
export async function handler(req: Request): Promise<Response> { /* ... */ }

// index.ts — entrypoint
import { handler } from "./handler.ts"
Deno.serve(handler)
```

## 🔑 Access & prerequisites

Request these from the manager at kickoff, over a secure channel. **None of them belong in the repo, in a commit, or in this issue.**

- **Supabase project** — project URL, anon key, service role key, and the direct Postgres connection string for `psql`. The manager creates the project and hands these over. **There is only one project**; it is simultaneously dev and production.
- **`pgtap` extension enabled** on that project — ask the manager to enable it from the Supabase dashboard (Database → Extensions) if it is not already on.
- **Supabase CLI** installed and linked (`supabase link`). **Docker is not required and is not used.**
- **`psql`** available locally — it is how you apply SQL and run tests.
- **Write access** to `Humble-Coders/HumbleDrive` (you have it if you can push a branch).

Keys go in a local `.env` that is already gitignored. The committed `.env.example` carries key *names* with empty values and nothing else.

## Scope

**1. Repo skeleton**

- `web/`, `android/`, `supabase/`, `docs/`, `handoffs/` (the last three partly exist)
- `docs/PROCESS.md` — the ticket workflow: `/draft-brief` → `/read-brief` + `/draft-ticket` → `/review-ticket` → `/start-ticket` → PR + `/handoff` → `/manager-review`
- `.github/ISSUE_TEMPLATE/feature-ticket.md` and `.github/pull_request_template.md`
- `README.md` — setup from zero: create/link the Supabase project, apply the schema, run the tests, and the exact commands for each

**2. Schema — `supabase/schema.sql` plus a matching initial migration**

Types: `stop_type` (`break | food | fuel | other`), `trip_status` (`pending | active | completed | cancelled`).

All primary keys `uuid default gen_random_uuid()` except `admins`. All timestamps `timestamptz`. Coordinates `double precision`.

- **`admins`** — `user_id` PK referencing `auth.users(id)` on delete cascade, `name`, `active bool not null default true`, `created_at`
- **`drivers`** — `id`, `name`, `email` unique with `check (email = lower(btrim(email)))`, `phone`, `active bool not null default true`, `created_at`
- **`routes`** — `id`, `name`, `origin_name`, `origin_place_id`, `origin_lat`, `origin_lng`, `dest_name`, `dest_place_id`, `dest_lat`, `dest_lng`, `encoded_polyline`, `distance_m int`, `drive_duration_s int`, `provider_response jsonb`, `created_by` → `admins(user_id)`, `created_at`
- **`route_stops`** — `id`, `route_id` → `routes` on delete cascade, `seq int not null`, `name`, `place_id`, `lat`, `lng`, `stop_type stop_type not null`, `planned_minutes int not null check (planned_minutes >= 0)`, **unique `(route_id, seq)`**
- **`trips`** — `id`, `route_id` → `routes`, `driver_id` → `drivers`, `code_hash text not null`, `code_sent_at`, `status trip_status not null default 'pending'`, `consignment_ref`, `consignment_desc`, `weight_kg numeric`, `receiver_name`, `receiver_phone`, `started_at`, `completed_at`, `pod_photo_path`, `created_by` → `admins(user_id)`, `created_at`
  - **Partial unique index on `driver_id` where `status in ('pending','active')`**
- **`driver_sessions`** — `id`, `trip_id` → `trips` on delete cascade, `token_hash text not null`, `device_label`, `created_at`, `last_seen_at`, `revoked_at`
- **`trip_stop_events`** — `id`, `trip_id` → `trips` on delete cascade, `route_stop_id` → `route_stops`, `arrived_at`, `resumed_at`, **unique `(trip_id, route_stop_id)`**
- **`track_points`** — `id`, `trip_id` → `trips` on delete cascade, `lat`, `lng`, `speed_mps real`, `heading_deg real`, `accuracy_m real`, `recorded_at timestamptz not null`, `received_at timestamptz not null default now()`
  - Index on `(trip_id, recorded_at)` — every trail query orders by device time, not arrival time

**3. Security**

- `alter table ... enable row level security` on **all eight** tables
- **Zero policies.** Not one. All access is via Edge Functions holding the service role key (CLAUDE.md rule 2)
- Revoke any default grants to `anon` and `authenticated`

**4. pgTAP tests — `supabase/tests/`**

At minimum, one test per invariant below. **Every file wrapped in `begin; ... rollback;`.** Run them with:

```bash
psql "$DB_URL" -f supabase/tests/constraints.test.sql
```

Document the exact command in the README — tickets 2 onward will run it constantly.

**5. First supervisor**

Document in the README how to create the first supervisor by hand: create the user in Supabase Auth, then insert the matching `admins` row. **No credentials in the repo** — this is a documented procedure, not a seed file with real values.

## Acceptance Criteria

- [ ] `schema.sql` applies cleanly to an empty database with no errors
- [ ] `supabase/migrations/` contains an initial migration that produces the identical schema
- [ ] `drivers.email` rejects `Foo@Bar.com` and `' a@b.com '`; accepts `a@b.com`
- [ ] A second `drivers` row with the same email is rejected
- [ ] A driver with a `pending` trip cannot be given a second `pending` or `active` trip
- [ ] The same driver **can** be given a new trip once the previous one is `completed` or `cancelled`
- [ ] `route_stops` rejects a duplicate `seq` within one route, and allows the same `seq` across different routes
- [ ] `planned_minutes` rejects a negative value
- [ ] Deleting a route cascades to its stops; deleting a trip cascades to its sessions, stop events, and track points
- [ ] `track_points` requires `recorded_at`; `received_at` defaults to `now()`
- [ ] RLS is enabled on all eight tables and `pg_policies` returns **zero rows** for them
- [ ] A client using the **anon key** can read nothing and write nothing to any of the eight tables — verified, not assumed
- [ ] pgTAP tests cover every criterion above and all pass
- [ ] **Every test file ends in `rollback`** and leaves zero rows behind — verified by checking row counts before and after a full test run
- [ ] No reset, drop, or truncate script exists anywhere in the repo
- [ ] The README contains no command requiring Docker
- [ ] README takes someone from an empty machine to a working schema with passing tests, using only the commands written in it
- [ ] `git grep` finds no service role key, anon key, or project URL anywhere in the repo
- [ ] `.env.example` is committed with names only and empty values

## Out of scope

- Any Edge Function, including the shared middleware (ticket 2)
- Any web or Android code (tickets 3 and 9)
- Supabase Storage bucket for delivery photos (ticket 14)
- Realtime publication for `track_points` (ticket 13)
- Seed data of any kind beyond the documented first-supervisor procedure
- CI. Tests run locally for now

## Dependencies

None. This is the first ticket. Everything else depends on it.

## References

- `docs/PRD.md` §4.4 (data model), §4.5 (trip state machine), §4.2 (architecture rules)
- `CLAUDE.md` — rules 1, 2, 5, and the Data & security section
- [Supabase pgTAP testing](https://supabase.com/docs/guides/database/testing)
- [Supabase CLI migrations](https://supabase.com/docs/guides/deployment/database-migrations)

## Kickoff prompt

```
/start-ticket <issue-number>
```

At kickoff, ask the manager for the Supabase project URL, anon key, service role key, and Postgres connection string over a secure channel, and confirm the `pgtap` extension is enabled.

**Before running a single test, confirm you understand this:** there is one database and it is also production. Tests are only safe because every file rolls back. Check that your test file ends in `rollback` before you run it, every time.
