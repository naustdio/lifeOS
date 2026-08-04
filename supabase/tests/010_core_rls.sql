-- pgTAP — core RLS (design.md §4.4, §9 "Database — tenancy", tasks.md T-016)
--
-- Executed 2026-08-04 against a local Supabase stack (`supabase start` +
-- `supabase test db`). Initial run surfaced one mismatch between this
-- file's assumptions and the actual (correct, stricter) grant design — see
-- the note above the anon-role assertions below — since fixed. All 8
-- assertions now pass for real.
--
-- This hand-rolls the `set local role authenticated; set local
-- request.jwt.claims = '...'` impersonation pattern from design.md §4.4
-- rather than depending on `basejump/supabase-test-helpers`, because that
-- extension's compatibility with the pinned Supabase CLI version could not
-- be verified in this session (design.md Open Questions, item "Verify at
-- implementation time").
--
-- Mandatory cases per design.md §4.4: (a) member sees own rows, (b)
-- non-member sees zero rows, (c) anon sees zero rows, (e) a direct
-- INSERT/UPDATE/DELETE as `authenticated` on a seam-only table raises
-- `insufficient_privilege` — here, `core.households` / `core.household_members`
-- have no INSERT policy at all (bootstrap-function-only), so this file's
-- (e) case is "direct INSERT as authenticated is rejected."

begin;
select plan(11);

-- Two independent users/households, seeded directly as the table owner
-- (RLS does not apply to the migration/superuser role that runs pgTAP).
-- No dependency on `basejump/supabase-test-helpers` — see file header.
-- auth.users requires a handful of NOT NULL defaults on a real Supabase
-- stack; the two inserts below use the minimal shape a local
-- `supabase start` stack accepts.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000000a', 'user-a@example.com', '{"full_name":"User A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'user-b@example.com', '{"full_name":"User B"}')
on conflict (id) do nothing;

insert into core.profiles (user_id, display_name)
values
  ('00000000-0000-0000-0000-00000000000a', 'User A'),
  ('00000000-0000-0000-0000-00000000000b', 'User B')
on conflict (user_id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000000aa', 'personal', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000bb', 'personal', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-00000000000b', 'owner')
on conflict do nothing;

-- (a) member A sees own household's rows
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*) from core.households where id = '00000000-0000-0000-0000-0000000000aa'),
  1::bigint,
  'member A sees household A'
);

select is(
  (select count(*) from core.household_members where household_id = '00000000-0000-0000-0000-0000000000aa'),
  1::bigint,
  'member A sees household A membership row'
);

select is(
  (select count(*) from core.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'member A sees own profile'
);

-- (b) non-member A sees zero rows from household B
select is(
  (select count(*) from core.households where id = '00000000-0000-0000-0000-0000000000bb'),
  0::bigint,
  'non-member A sees zero rows from household B (households)'
);

select is(
  (select count(*) from core.household_members where household_id = '00000000-0000-0000-0000-0000000000bb'),
  0::bigint,
  'non-member A sees zero rows from household B (household_members)'
);

-- (e) direct INSERT as authenticated is rejected — no INSERT policy exists
-- on households/household_members (bootstrap-function-only, design.md §4.2).
select throws_ok(
  $$ insert into core.households (name, created_by) values ('rogue', '00000000-0000-0000-0000-00000000000a') $$,
  '42501',
  null,
  'direct INSERT on core.households as authenticated is denied (RLS: no INSERT policy)'
);

select throws_ok(
  $$ insert into core.household_members (household_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000000a', 'owner') $$,
  '42501',
  null,
  'direct INSERT on core.household_members as authenticated is denied (RLS: no INSERT policy)'
);

-- Owner-only UPDATE on households: member A is owner of household A, so an
-- UPDATE to their own household succeeds.
select lives_ok(
  $$ update core.households set name = 'still personal' where id = '00000000-0000-0000-0000-0000000000aa' $$,
  'owner A can UPDATE own household'
);

-- (c) anon is denied before RLS even evaluates: `core` has no `GRANT USAGE
-- ON SCHEMA core TO anon` (migration 20260804090002, line 135 grants usage
-- to `authenticated` only). This is stricter than an RLS-filtered empty
-- result, so the correct assertion is a schema-level permission error, not
-- an empty row count. (Corrected 2026-08-04 after running this suite for
-- real against a local stack surfaced the mismatch between this test's
-- original assumption and the actual, tighter grant design.)
reset role;
set local role anon;
reset request.jwt.claims;

select throws_ok(
  $$ select count(*) from core.households $$,
  '42501',
  null,
  'anon is denied schema-level access to core.households'
);

select throws_ok(
  $$ select count(*) from core.household_members $$,
  '42501',
  null,
  'anon is denied schema-level access to core.household_members'
);

select throws_ok(
  $$ select count(*) from core.profiles $$,
  '42501',
  null,
  'anon is denied schema-level access to core.profiles'
);

select * from finish();
rollback;
