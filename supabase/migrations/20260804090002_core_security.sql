-- core_security.sql (design.md §4.1, §4.2, slice 1)
-- Membership helper functions, RLS policies, and grants for `core.*`.

-- ---------------------------------------------------------------------------
-- 1. Membership helpers (the recursion fix — design.md §4.1)
-- ---------------------------------------------------------------------------
-- `SECURITY DEFINER` here is not laziness: a policy ON `core.household_members`
-- that itself queries `core.household_members` produces
-- `infinite recursion detected in policy`. The definer function reads the
-- table with RLS bypassed, breaking the cycle. `set search_path = ''` (with
-- fully-qualified names everywhere) is mandatory — Supabase's
-- `function_search_path_mutable` linter flags its absence, and a mutable
-- search_path on a definer function is a privilege-escalation vector.
--
-- `(select auth.uid())` rather than bare `auth.uid()` lets the planner cache
-- it as an InitPlan instead of re-evaluating per row.
create or replace function core.is_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from core.household_members m
     where m.household_id = p_household_id
       and m.user_id = (select auth.uid())
  );
$$;

create or replace function core.is_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from core.household_members m
     where m.household_id = p_household_id
       and m.user_id = (select auth.uid())
       and m.role = 'owner'
  );
$$;

-- Used inside every later `SECURITY DEFINER` seam function (design.md §4.3):
-- each definer opens with `perform core.assert_member(p_household_id);` as
-- its own explicit re-implementation of the policy it bypasses.
create or replace function core.assert_member(p_household_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not core.is_member(p_household_id) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
end;
$$;

grant execute on function core.is_member(uuid) to authenticated;
grant execute on function core.is_owner(uuid) to authenticated;
grant execute on function core.assert_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RLS — deny-by-default floor (design.md §4.2)
-- ---------------------------------------------------------------------------
-- Every table: RLS enabled with no permissive default. An RLS-enabled table
-- with zero policies denies everything. Every policy is `TO authenticated`
-- so the `anon` role short-circuits without evaluating any predicate.
alter table core.profiles enable row level security;
alter table core.households enable row level security;
alter table core.household_members enable row level security;

-- core.profiles
--   SELECT: own row, or a row that shares any household with the caller
--           (sharing-ready, per the tenancy model — not exposed in UI yet).
--   INSERT/UPDATE: own row only. No DELETE.
create policy profiles_select on core.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from core.household_members m
       where m.user_id = core.profiles.user_id
         and core.is_member(m.household_id)
    )
  );

create policy profiles_insert on core.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_update on core.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- core.households
--   SELECT: member of the household.
--   INSERT: none — bootstrap function only (SECURITY DEFINER, not an RLS
--           INSERT policy).
--   UPDATE: owner only. No DELETE.
create policy households_select on core.households
  for select to authenticated
  using (core.is_member(id));

create policy households_update on core.households
  for update to authenticated
  using (core.is_owner(id))
  with check (core.is_owner(id));

-- core.household_members
--   SELECT: member of the household.
--   INSERT/UPDATE: none — bootstrap/invite function only.
--   DELETE: owner only.
create policy household_members_select on core.household_members
  for select to authenticated
  using (core.is_member(household_id));

create policy household_members_delete on core.household_members
  for delete to authenticated
  using (core.is_owner(household_id));

-- ---------------------------------------------------------------------------
-- 3. Grants — table-level privileges layered under the RLS policies above.
--    RLS restricts ROWS; Postgres still requires a table-level GRANT for the
--    corresponding operation to even be attempted.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema core from anon, authenticated;
alter default privileges in schema core revoke all on tables from anon, authenticated;

grant usage on schema core to authenticated;
grant select, insert, update on core.profiles to authenticated;
grant select, update on core.households to authenticated;
grant select, delete on core.household_members to authenticated;
