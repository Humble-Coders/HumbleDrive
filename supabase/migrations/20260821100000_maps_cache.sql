-- Cost controls for the billed Google APIs (ticket 4).
--
-- Both tables exist because Edge Functions are ephemeral and horizontally
-- scaled: an in-memory cache would have a near-random hit rate and an
-- in-memory rate limit would be unenforceable. Neither is a performance
-- optimisation — they are there so a bug or a fiddling supervisor cannot
-- quietly run up a bill.

-- Keyed by a hash of the normalised request. Wizard step 3 re-requests the
-- route on EVERY stop edit — add, remove, reorder — so a supervisor adjusting
-- stop order for two minutes would otherwise bill a dozen identical calls.
create table routes_cache (
  request_hash text primary key,
  response     jsonb not null,
  created_at   timestamptz not null default now()
);

create index routes_cache_created_at on routes_cache (created_at);

-- Fixed-window counting, which is enough: we are protecting a budget, not
-- defending against a determined attacker.
create table api_rate_limits (
  user_id      uuid not null,
  endpoint     text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (user_id, endpoint, window_start)
);

alter table routes_cache    enable row level security;
alter table api_rate_limits enable row level security;

revoke all on routes_cache, api_rate_limits from anon, authenticated;

-- Atomic increment-and-read. Doing this as select-then-update would let two
-- concurrent requests both read the old count and both pass the limit.
create or replace function bump_rate_limit(
  p_user_id  uuid,
  p_endpoint text,
  p_window   timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into api_rate_limits (user_id, endpoint, window_start, count)
  values (p_user_id, p_endpoint, p_window, 1)
  on conflict (user_id, endpoint, window_start)
    do update set count = api_rate_limits.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function bump_rate_limit(uuid, text, timestamptz) from public, anon, authenticated;
