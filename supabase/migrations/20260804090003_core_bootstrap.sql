-- core_bootstrap.sql (design.md §6.2, slice 1)
-- `core.ensure_personal_space()` — idempotent, race-free personal-space
-- bootstrap. NOT granted to `authenticated`: reachable only through
-- `app.bootstrap_user()` (added in the next migration).

create or replace function core.ensure_personal_space()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into core.profiles (user_id, display_name, avatar_url)
  select v_user,
         coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
         u.raw_user_meta_data ->> 'avatar_url'
    from auth.users u
   where u.id = v_user
  on conflict (user_id) do update
     set display_name = excluded.display_name,
         avatar_url   = excluded.avatar_url,
         updated_at   = now();

  insert into core.households (name, personal_owner_user_id, created_by)
  values ('personal', v_user, v_user)
  on conflict (personal_owner_user_id) do nothing
  returning id into v_household;

  -- Race resolution: the `personal_owner_user_id UNIQUE` index is the actual
  -- guarantee, not this code path. Two concurrent first sign-ins both attempt
  -- the insert; Postgres serializes them on the index, the loser's
  -- `DO NOTHING` yields no row, and the follow-up SELECT returns the
  -- winner's household. Both callers end up in the same space.
  if v_household is null then
    select id into v_household
      from core.households
     where personal_owner_user_id = v_user;
  end if;

  insert into core.household_members (household_id, user_id, role)
  values (v_household, v_user, 'owner')
  on conflict (household_id, user_id) do nothing;

  return v_household;
end;
$$;

-- Deliberately NOT granted to `authenticated` — reachable only through
-- `app.bootstrap_user()` (design.md §5.5, T-013). Postgres grants EXECUTE on
-- new functions to PUBLIC by default; revoke it explicitly.
revoke execute on function core.ensure_personal_space() from public;
