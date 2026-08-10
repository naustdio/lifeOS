-- `health` schema RLS + grants — design.md Migration Sequence #3.
-- Mirrors `finance.accounts_select` byte-for-byte (design.md Decision 4.2): every health table
-- is readable by a household member only when the row is `visibility = 'household'` or the
-- caller owns it. Writes are plain RLS-guarded CRUD by the owner — health has no seam-only
-- write surface like Finance's transactions/accounts, so INSERT/UPDATE/DELETE policies are
-- straightforward owner-or-household-write policies scoped by `core.is_member`.

alter table health.events         enable row level security;
alter table health.vital_readings enable row level security;
alter table health.profile_facts  enable row level security;

-- health.events
create policy events_select on health.events
  for select to authenticated
  using (core.is_member(household_id) and (visibility = 'household' or owner_user_id = (select auth.uid())));

create policy events_insert on health.events
  for insert to authenticated
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy events_update on health.events
  for update to authenticated
  using (core.is_member(household_id) and owner_user_id = (select auth.uid()))
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy events_delete on health.events
  for delete to authenticated
  using (core.is_member(household_id) and owner_user_id = (select auth.uid()));

-- health.vital_readings
create policy vital_readings_select on health.vital_readings
  for select to authenticated
  using (core.is_member(household_id) and (visibility = 'household' or owner_user_id = (select auth.uid())));

create policy vital_readings_insert on health.vital_readings
  for insert to authenticated
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy vital_readings_update on health.vital_readings
  for update to authenticated
  using (core.is_member(household_id) and owner_user_id = (select auth.uid()))
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy vital_readings_delete on health.vital_readings
  for delete to authenticated
  using (core.is_member(household_id) and owner_user_id = (select auth.uid()));

-- health.profile_facts
create policy profile_facts_select on health.profile_facts
  for select to authenticated
  using (core.is_member(household_id) and (visibility = 'household' or owner_user_id = (select auth.uid())));

create policy profile_facts_insert on health.profile_facts
  for insert to authenticated
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy profile_facts_update on health.profile_facts
  for update to authenticated
  using (core.is_member(household_id) and owner_user_id = (select auth.uid()))
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy profile_facts_delete on health.profile_facts
  for delete to authenticated
  using (core.is_member(household_id) and owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants — mirrors 20260804090006's revoke-then-explicit-grant shape. `alter default
-- privileges` on a NEWLY created schema has no prior grants to strip, but the explicit
-- `revoke all` + `grant` pair is still applied for parity with every other schema in this repo.
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema health from anon, authenticated;
revoke all on all functions in schema health from anon, authenticated;
alter default privileges in schema health revoke all on tables    from anon, authenticated;
alter default privileges in schema health revoke all on functions from anon, authenticated;

grant usage on schema health to authenticated;
grant select, insert, update, delete on health.events, health.vital_readings, health.profile_facts
      to authenticated;
-- health.enforce_private_event_account(): no EXECUTE grant — it is invoked only by the
-- BEFORE INSERT/UPDATE trigger, never called directly by client code.
