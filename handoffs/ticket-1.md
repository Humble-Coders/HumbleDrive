# Handoff — Ticket #1

**Ticket:** [#1 — T1 · Repo foundation + database schema](https://github.com/Humble-Coders/HumbleDrive/issues/1)
**Branch:** `ticket-1-repo-foundation-schema`
**Diff:** 10 files, +816 / −0

## Summary

Lays the monorepo skeleton and lands the database with every product invariant
expressed as a Postgres constraint rather than an API convention. Eight tables,
two enums and `pgtap` were applied to the Supabase project via a hand-written
forward-only migration, with `schema.sql` as a byte-identical readable mirror
that is never applied. RLS is enabled across all eight tables with zero
policies, and `anon`/`authenticated` hold no table privileges — verified by
real REST calls with the publishable key, not inferred from configuration. A
21-assertion pgTAP suite proves each constraint actually rejects what it
should, wrapped in a transaction that rolls back so it is safe against the
single shared project. The README takes someone from an empty machine to a
working schema with passing tests, using no Docker-dependent command.

## Files changed

### Database
| File | Why |
|---|---|
| `supabase/migrations/20260821090000_init.sql` (+176) | The applied history: extensions, enums, 8 tables, constraints, indexes, RLS, grant revokes |
| `supabase/schema.sql` (+182) | Readable reference. Body byte-identical to the migration; never applied |
| `supabase/tests/constraints.test.sql` (+170) | 21 pgTAP assertions, one per invariant, wrapped `begin; … rollback;` |

### Documentation
| File | Why |
|---|---|
| `README.md` (+158) | Setup from zero, migration and test workflow, first-supervisor procedure, and what the database guarantees |
| `docs/PROCESS.md` (+45) | The ticket workflow, branch naming, and where decisions live |
| `.github/ISSUE_TEMPLATE/feature-ticket.md` (+45) | Ticket structure matching how tickets 1–15 were drafted |
| `.github/pull_request_template.md` (+27) | Review checklist tied to acceptance criteria and the secret/migration rules |

### Skeleton
| File | Why |
|---|---|
| `.env.example` (+13) | The four variable names, empty, with where each value comes from |
| `web/.gitkeep`, `android/.gitkeep` | Reserve the module folders for tickets 3 and 9 |

## How to test

```bash
git checkout ticket-1-repo-foundation-schema
cp .env.example .env          # fill from the Supabase dashboard
set -a; . ./.env; set +a
```

**1. Run the suite** — expect 21 `ok`, zero `not ok`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/constraints.test.sql
```

**2. Confirm the rollback left nothing** — expect all zeros:

```bash
psql "$SUPABASE_DB_URL" -tAc "select 'drivers='||(select count(*) from drivers)||' trips='||(select count(*) from trips)||' points='||(select count(*) from track_points);"
```

**3. Confirm the lockdown** — expect `8 / 0 / 0 / 0`:

```bash
psql "$SUPABASE_DB_URL" -tAc "
select (select count(*) from pg_tables where schemaname='public')
    || ' / ' || (select count(*) from pg_tables where schemaname='public' and not rowsecurity)
    || ' / ' || (select count(*) from pg_policies where schemaname='public')
    || ' / ' || (select count(*) from information_schema.role_table_grants
                  where table_schema='public' and grantee in ('anon','authenticated'));"
```

**4. Confirm the publishable key is powerless** — expect `401` on every line:

```bash
for t in drivers trips track_points; do
  curl -s -o /dev/null -w "$t %{http_code}\n" "$VITE_SUPABASE_URL/rest/v1/$t?select=*" \
    -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY"
done
```

**5. Confirm the mirror matches the migration** — expect no output:

```bash
diff <(tail -n +6 supabase/migrations/20260821090000_init.sql) <(tail -n +12 supabase/schema.sql)
```

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `schema.sql` applies cleanly to an empty database | ⚠️ **Met by equivalence** — see Deviations |
| 2 | Migration produces the identical schema | ✅ `diff` of bodies is empty |
| 3 | `drivers.email` rejects `Foo@Bar.com` and `' a@b.com '`; accepts `a@b.com` | ✅ tests 1–3 |
| 4 | Duplicate email rejected | ✅ test 4 |
| 5 | Driver with a `pending` trip cannot get a second `pending` or `active` | ✅ tests 5–6 |
| 6 | Same driver **can** after `completed` or `cancelled` | ✅ tests 7–8 |
| 7 | Duplicate `seq` rejected per route; same `seq` allowed across routes | ✅ tests 9–10 |
| 8 | Negative `planned_minutes` rejected | ✅ test 11 |
| 9 | Route→stops and trip→sessions/events/points cascades | ✅ tests 15–18 |
| 10 | `track_points` requires `recorded_at`; `received_at` defaults | ✅ tests 12–13 |
| 11 | RLS on all eight; `pg_policies` returns zero rows | ✅ tests 19–20, and live check |
| 12 | Publishable-key client can read and write nothing — verified, not assumed | ✅ test 21 (grants) **plus real REST calls: 401 `42501` on 3 reads and 1 write** |
| 13 | pgTAP covers every criterion and all pass | ✅ 21 passing, 0 failing |
| 14 | Every test file ends in `rollback`, leaving zero rows | ✅ row counts zero after a full run |
| 15 | No reset, drop or truncate script in the repo | ✅ `git grep` clean |
| 16 | README contains no Docker-requiring command | ✅ only the prohibition notice mentions Docker |
| 17 | README takes someone from empty machine to passing tests | ✅ every command in it was run during this ticket |
| 18 | `git grep` finds no secret key, publishable key or project URL | ✅ clean; only Supabase docs URLs |
| 19 | `.env.example` committed with names only, empty values | ✅ four names, no values |

## Deviations / decisions

**Criterion 1 — `schema.sql` was not directly executed.** It is verified
*equivalent* to the migration, which did apply cleanly to an empty database.
Applying `schema.sql` itself was not possible and would have been wrong: there
is one Supabase project, it is no longer empty, and the ticket explicitly
forbids running `schema.sql` against the live database. The `diff` in step 5
above is the evidence.

**`supabase db push` failed partway with `Access token not provided`.** The CLI
lost keychain access to its token after `link` and `migration list` had both
succeeded. The migration was applied with `psql` and the version inserted into
`supabase_migrations.schema_migrations` by hand, so CLI history remains
accurate. Documented in the README, since it will recur.

**Test count is 21, not the ~13 the ticket's criteria imply.** Several criteria
needed more than one assertion to be honest — "rejects X and accepts Y" is two
facts, and the cascade criterion is four.

**A grants check was added beyond the ticket.** RLS with no policies already
denies everything, but revoking privileges as well means a future accidental
policy cannot silently open a door. Both the revoke and its test are in the diff.

**Two spec changes were made before coding**, both committed to `main`
separately: adopting Supabase's current publishable/secret key naming (D-39,
matching what the dashboard shows) and recording the project region as
ap-south-1 (D-40, after the project was recreated out of ap-northeast-2).

## Open questions / follow-ups

- **`supabase db push` reliability.** The keychain failure may be
  environment-specific. If it recurs for others, the `psql` fallback should
  become the documented default rather than the fallback.
- **`pgtap` is installed on the production database.** Harmless and required
  for the test workflow given no local stack, but worth knowing it is there.
- **No CI.** Tests run locally only, by agreement in the ticket. Once a second
  developer joins, an unrun test suite is a matter of time.
- **First supervisor not created.** The README documents the procedure; it
  needs a real Auth user, which ticket 2 requires and this ticket does not.
