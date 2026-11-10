-- Trip creation and cancellation (tickets 7 and 8).

-- Cancelling a PENDING trip is an administrative correction: nobody started,
-- nothing is lost. Cancelling an ACTIVE trip means a driver is on the road and
-- is being told to stop. Same status, very different events — so a reason is
-- recorded, and required for the second.
alter table trips
  add column cancel_reason text,
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid references admins (user_id);

-- Route + stops + trip in ONE transaction.
--
-- supabase-js has no multi-statement transaction, so this lives in Postgres,
-- which is also where CLAUDE.md rule 1 says the guarantee belongs. A route
-- without its stops, or stops without a trip, is corruption no later screen
-- can make sense of.
--
-- It receives a code HASH. It never sees a plaintext code.
create or replace function create_trip(
  p_route      jsonb,
  p_stops      jsonb,
  p_driver_id  uuid,
  p_created_by uuid,
  p_code_hash  text,
  p_consignment jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id uuid;
  v_trip_id  uuid;
  v_active   boolean;
  v_stop     jsonb;
  v_seq      integer := 0;
begin
  -- Checked here, not only in the API, so two supervisors racing cannot both win.
  select active into v_active from drivers where id = p_driver_id for update;
  if v_active is null then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;
  if not v_active then
    raise exception 'driver_inactive' using errcode = 'P0001';
  end if;

  insert into routes (
    name, origin_name, origin_place_id, origin_lat, origin_lng,
    dest_name, dest_place_id, dest_lat, dest_lng,
    encoded_polyline, distance_m, drive_duration_s, provider_response, created_by
  ) values (
    p_route->>'name',
    p_route->>'origin_name', p_route->>'origin_place_id',
    (p_route->>'origin_lat')::double precision, (p_route->>'origin_lng')::double precision,
    p_route->>'dest_name', p_route->>'dest_place_id',
    (p_route->>'dest_lat')::double precision, (p_route->>'dest_lng')::double precision,
    p_route->>'encoded_polyline',
    (p_route->>'distance_m')::integer,
    (p_route->>'drive_duration_s')::integer,
    p_route->'provider_response',
    p_created_by
  ) returning id into v_route_id;

  for v_stop in select * from jsonb_array_elements(coalesce(p_stops, '[]'::jsonb))
  loop
    v_seq := v_seq + 1;
    insert into route_stops (route_id, seq, name, place_id, lat, lng, stop_type, planned_minutes)
    values (
      v_route_id, v_seq,
      v_stop->>'name', v_stop->>'place_id',
      (v_stop->>'lat')::double precision, (v_stop->>'lng')::double precision,
      (v_stop->>'stop_type')::stop_type,
      (v_stop->>'planned_minutes')::integer
    );
  end loop;

  -- The partial unique index is the real backstop here: if a driver already
  -- holds a live run, this insert fails and the whole transaction unwinds.
  insert into trips (
    route_id, driver_id, code_hash, status,
    consignment_ref, consignment_desc, weight_kg, receiver_name, receiver_phone,
    created_by
  ) values (
    v_route_id, p_driver_id, p_code_hash, 'pending',
    p_consignment->>'ref', p_consignment->>'description',
    nullif(p_consignment->>'weight_kg', '')::numeric,
    p_consignment->>'receiver_name', p_consignment->>'receiver_phone',
    p_created_by
  ) returning id into v_trip_id;

  return v_trip_id;
exception
  when unique_violation then
    raise exception 'driver_busy' using errcode = 'P0001';
end;
$$;

revoke all on function create_trip(jsonb, jsonb, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
