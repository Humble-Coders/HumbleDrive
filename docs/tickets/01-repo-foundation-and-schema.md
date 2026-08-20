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

**Environment.** You develop against a hosted Supabase **dev** project, not a local Docker stack (manager's call). Two consequences you must respect:

- The pgTAP tests are **destructive** — they insert and roll back against real tables. They must only ever run against the dev project. Never point them at production.
- `supabase test db` targets the local stack, so it will not work here. Enable the `pgtap` extension on the dev project and run the test files with `psql` against it. Document the exact command you settle on in the README, because ticket 2 onwards will run it constantly.

**Migrations.** `supabase/schema.sql` is the human-readable source of truth for the whole schema. `supabase/migrations/` holds timestamped CLI-generated files that are the actual applied history. This ticket produces both, consistent with each other. Every later ticket adds a migration and updates `schema.sql` to match.

## 🔑 Access & prerequisites

Request these from the manager at kickoff, over a secure channel. **None of them belong in the repo, in a commit, or in this issue.**

- **Supabase dev project** — project URL, anon key, service role key. The manager creates the project and hands these over, or invites you to the Supabase org.
- Confirmation of **which project is dev and which is production**, in writing, before you run a single test.
- **Supabase CLI** installed locally and linked to the dev project (`supabase link`).
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

At minimum, one test per invariant below. Include a short "how to run these" note in the README.

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

At kickoff, ask the manager for the Supabase dev project URL, anon key, and service role key over a secure channel, and get written confirmation of which project is dev versus production **before running any test**. The tests are destructive.
