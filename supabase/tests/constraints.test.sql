-- Humble Drive — constraint tests (ticket 1)
--
-- Every assertion here proves the DATABASE rejects something, not that the
-- API remembers to. CLAUDE.md rule 1.
--
-- Wrapped in a transaction that is rolled back. This project has ONE
-- Supabase project serving as both development and production, so a test
-- file without a closing rollback is a defect regardless of whether it
-- passes. Nothing below survives the run.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/constraints.test.sql

set search_path = extensions, public;

begin;
select plan(21);

-- fixtures ---------------------------------------------------------------
insert into drivers (id, name, email)
values ('11111111-1111-1111-1111-111111111111', 'Test Driver', 'test+alice@humblecoders.in');

insert into routes (id, origin_name, origin_lat, origin_lng,
                    dest_name, dest_lat, dest_lng,
                    encoded_polyline, distance_m, drive_duration_s)
values ('22222222-2222-2222-2222-222222222222', 'Ludhiana', 30.9010, 75.8573,
        'Delhi', 28.6139, 77.2090, 'abc', 310000, 21600),
       ('33333333-3333-3333-3333-333333333333', 'Amritsar', 31.6340, 74.8723,
        'Jaipur', 26.9124, 75.7873, 'def', 620000, 39600);

-- lowercase email --------------------------------------------------------
select throws_ok(
  $$insert into drivers (name, email) values ('X', 'Foo@Bar.com')$$,
  '23514', null, 'mixed-case email is rejected');

select throws_ok(
  $$insert into drivers (name, email) values ('X', ' a@b.com ')$$,
  '23514', null, 'untrimmed email is rejected');

select lives_ok(
  $$insert into drivers (name, email) values ('X', 'test+clean@humblecoders.in')$$,
  'clean lowercase email is accepted');

select throws_ok(
  $$insert into drivers (name, email) values ('Y', 'test+alice@humblecoders.in')$$,
  '23505', null, 'duplicate email is rejected');

-- one live run per driver -------------------------------------------------
insert into trips (id, route_id, driver_id, code_hash, status)
values ('44444444-4444-4444-4444-444444444444',
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'hash1', 'pending');

select throws_ok(
  $$insert into trips (route_id, driver_id, code_hash, status)
    values ('22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', 'hash2', 'pending')$$,
  '23505', null, 'a driver cannot hold two pending trips');

select throws_ok(
  $$insert into trips (route_id, driver_id, code_hash, status)
    values ('22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', 'hash3', 'active')$$,
  '23505', null, 'a driver cannot hold a pending and an active trip');

update trips set status = 'completed'
 where id = '44444444-4444-4444-4444-444444444444';

select lives_ok(
  $$insert into trips (route_id, driver_id, code_hash, status)
    values ('22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', 'hash4', 'pending')$$,
  'a driver CAN take a new trip once the previous one is completed');

update trips set status = 'cancelled'
 where code_hash = 'hash4';

select lives_ok(
  $$insert into trips (route_id, driver_id, code_hash, status)
    values ('22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', 'hash5', 'pending')$$,
  'a driver CAN take a new trip once the previous one is cancelled');

-- stop ordering ----------------------------------------------------------
insert into route_stops (route_id, seq, name, lat, lng, stop_type, planned_minutes)
values ('22222222-2222-2222-2222-222222222222', 1, 'Dhaba', 30.5, 76.0, 'food', 30);

select throws_ok(
  $$insert into route_stops (route_id, seq, name, lat, lng, stop_type, planned_minutes)
    values ('22222222-2222-2222-2222-222222222222', 1, 'Other', 30.6, 76.1, 'break', 15)$$,
  '23505', null, 'duplicate seq within one route is rejected');

select lives_ok(
  $$insert into route_stops (route_id, seq, name, lat, lng, stop_type, planned_minutes)
    values ('33333333-3333-3333-3333-333333333333', 1, 'Other route', 30.6, 76.1, 'break', 15)$$,
  'the same seq is allowed on a different route');

select throws_ok(
  $$insert into route_stops (route_id, seq, name, lat, lng, stop_type, planned_minutes)
    values ('22222222-2222-2222-2222-222222222222', 9, 'Bad', 30.7, 76.2, 'break', -5)$$,
  '23514', null, 'negative planned_minutes is rejected');

-- track_points -----------------------------------------------------------
select throws_ok(
  $$insert into track_points (trip_id, lat, lng)
    values ('44444444-4444-4444-4444-444444444444', 30.0, 76.0)$$,
  '23502', null, 'track_points requires recorded_at');

insert into track_points (trip_id, lat, lng, recorded_at)
values ('44444444-4444-4444-4444-444444444444', 30.0, 76.0, now() - interval '2 hours');

select ok(
  (select received_at > recorded_at from track_points limit 1),
  'received_at defaults to now(), independent of recorded_at');

-- one event per stop per trip --------------------------------------------
insert into trip_stop_events (trip_id, route_stop_id)
select '44444444-4444-4444-4444-444444444444', id
  from route_stops where route_id = '22222222-2222-2222-2222-222222222222' and seq = 1;

select throws_ok(
  $$insert into trip_stop_events (trip_id, route_stop_id)
    select '44444444-4444-4444-4444-444444444444', id
      from route_stops where route_id = '22222222-2222-2222-2222-222222222222' and seq = 1$$,
  '23505', null, 'one stop event per (trip, stop)');

-- cascades ---------------------------------------------------------------
insert into driver_sessions (trip_id, token_hash)
values ('44444444-4444-4444-4444-444444444444', 'tokhash');

delete from trips where id = '44444444-4444-4444-4444-444444444444';

select is((select count(*)::int from driver_sessions
            where trip_id = '44444444-4444-4444-4444-444444444444'), 0,
          'deleting a trip cascades to driver_sessions');

select is((select count(*)::int from track_points
            where trip_id = '44444444-4444-4444-4444-444444444444'), 0,
          'deleting a trip cascades to track_points');

select is((select count(*)::int from trip_stop_events
            where trip_id = '44444444-4444-4444-4444-444444444444'), 0,
          'deleting a trip cascades to trip_stop_events');

delete from trips where driver_id = '11111111-1111-1111-1111-111111111111';
delete from routes where id = '22222222-2222-2222-2222-222222222222';

select is((select count(*)::int from route_stops
            where route_id = '22222222-2222-2222-2222-222222222222'), 0,
          'deleting a route cascades to route_stops');

-- lockdown ---------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables
    where schemaname = 'public' and not rowsecurity), 0,
  'RLS is enabled on every table in public');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public'), 0,
  'there are zero policies — the lockout is total');

-- Belt and braces: RLS with no policies already denies everything, but a
-- future accidental policy could open a door if grants were still in place.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')), 0,
  'anon and authenticated hold no table privileges in public');

select * from finish();
rollback;
