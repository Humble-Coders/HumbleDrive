-- Humble Drive — schema reference
--
-- This file is the human-readable picture of what the schema SHOULD be.
-- It is NOT applied. Never run it against the database: there is one
-- Supabase project and it is also production.
--
-- Actual changes are forward-only migrations in supabase/migrations/,
-- and every ticket that adds one updates this file to match.
--
-- Generated from: 20260821090000_init.sql (ticket 1)

-- later tickets assume.

create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------- types

create type stop_type   as enum ('break', 'food', 'fuel', 'other');
create type trip_status as enum ('pending', 'active', 'completed', 'cancelled');

-- ---------------------------------------------------------------- admins
-- A Supabase Auth account is NOT a supervisor. An active row here is what
-- makes one. Both checks, in that order, on every supervisor endpoint.

create table admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- drivers
-- email is lowercase-only. Two casings of one address would be two driver
-- records for one human, and "one active run per driver" would quietly stop
-- meaning anything.

create table drivers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique check (email = lower(btrim(email))),
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- routes

create table routes (
  id                uuid primary key default gen_random_uuid(),
  name              text,
  origin_name       text not null,
  origin_place_id   text,
  origin_lat        double precision not null,
  origin_lng        double precision not null,
  dest_name         text not null,
  dest_place_id     text,
  dest_lat          double precision not null,
  dest_lng          double precision not null,
  encoded_polyline  text not null,
  distance_m        integer not null check (distance_m >= 0),
  drive_duration_s  integer not null check (drive_duration_s >= 0),
  provider_response jsonb,
  created_by        uuid references admins (user_id),
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------- route_stops
-- Driver rest, food and fuel breaks (PRD D-3). Nothing is loaded or
-- unloaded at a stop; there is no recipient and no proof to capture.
-- Order is data, not array position in a JSON blob.

create table route_stops (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid not null references routes (id) on delete cascade,
  seq             integer not null,
  name            text not null,
  place_id        text,
  lat             double precision not null,
  lng             double precision not null,
  stop_type       stop_type not null,
  planned_minutes integer not null check (planned_minutes >= 0),
  unique (route_id, seq)
);

-- ----------------------------------------------------------------- trips

create table trips (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null references routes (id),
  driver_id         uuid not null references drivers (id),
  code_hash         text not null,
  code_sent_at      timestamptz,
  status            trip_status not null default 'pending',
  consignment_ref   text,
  consignment_desc  text,
  weight_kg         numeric check (weight_kg is null or weight_kg >= 0),
  receiver_name     text,
  receiver_phone    text,
  started_at        timestamptz,
  completed_at      timestamptz,
  pod_photo_path    text,
  created_by        uuid references admins (user_id),
  created_at        timestamptz not null default now()
);

-- One live run per driver. This index is the guarantee: if two supervisors
-- assign the same driver at the same moment, one insert fails here.
create unique index trips_one_live_per_driver
  on trips (driver_id)
  where status in ('pending', 'active');

create index trips_status_created_at on trips (status, created_at desc);

-- ------------------------------------------------------- driver_sessions
-- Only the token hash is stored. Sessions expire with their trip (D-26).

create table driver_sessions (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips (id) on delete cascade,
  token_hash   text not null,
  device_label text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

create index driver_sessions_trip_id on driver_sessions (trip_id);

-- ------------------------------------------------------ trip_stop_events
-- resumed_at - arrived_at is the actual break duration, compared against
-- route_stops.planned_minutes. An absent row means the break was not taken:
-- skipping is implicit, because breaks are advisory (D-8).

create table trip_stop_events (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips (id) on delete cascade,
  route_stop_id uuid not null references route_stops (id),
  arrived_at    timestamptz,
  resumed_at    timestamptz,
  unique (trip_id, route_stop_id)
);

-- ----------------------------------------------------------- track_points
-- Two timestamps, frequently hours apart. recorded_at is the device clock
-- when the fix was taken; received_at is the server clock when it arrived.
-- Offline batching means a fix taken in a dead zone at 2pm can arrive at
-- 4pm. Trails are ALWAYS ordered by recorded_at.

create table track_points (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  speed_mps   real,
  heading_deg real,
  accuracy_m  real,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index track_points_trip_recorded on track_points (trip_id, recorded_at);

-- -------------------------------------------------------------------- RLS
-- On everywhere, with zero policies. This is a deliberate lockout, not an
-- oversight: nothing reaches these tables except an Edge Function holding
-- the secret key, which bypasses RLS. CLAUDE.md rule 2.

alter table admins           enable row level security;
alter table drivers          enable row level security;
alter table routes           enable row level security;
alter table route_stops      enable row level security;
alter table trips            enable row level security;
alter table driver_sessions  enable row level security;
alter table trip_stop_events enable row level security;
alter table track_points     enable row level security;

-- Supabase grants table privileges to anon/authenticated by default. RLS
-- with no policies already denies everything, but revoking as well means a
-- future accidental policy cannot silently open a door.
revoke all on admins, drivers, routes, route_stops, trips,
              driver_sessions, trip_stop_events, track_points
  from anon, authenticated;
