-- pgTAP — core.is_member() SECURITY DEFINER recursion guard (design.md §4.1, tasks.md T-033)
--
-- The trap this proves: `core.household_members_select` policy calls `core.is_member()`, and
-- `core.is_member()` itself queries `core.household_members`. If `is_member()` were a plain
-- (SECURITY INVOKER, the PL/pgSQL/SQL default) function instead of SECURITY DEFINER, evaluating
-- that inner query would re-trigger RLS on `core.household_members` — i.e. re-evaluate the very
-- policy currently being evaluated — which Postgres detects as unbounded recursion (observed on
-- this engine as `stack depth limit exceeded`, sqlstate 54001 — see case 2 below for the actual
-- confirmed behavior, not the design doc's informal "infinite recursion detected in policy"
-- phrasing). SECURITY DEFINER breaks the cycle by letting the function read the table as its
-- (RLS-bypassing) owner.
--
-- A happy-path membership check that queries a DIFFERENT table (e.g. `finance.accounts`, whose
-- policy merely calls `is_member()`) would pass identically whether `is_member()` is definer or
-- not, because the recursion only occurs when the function's own internal query targets the same
-- table whose policy is invoking it. This test targets `core.household_members` itself, and it
-- additionally proves the failure mode by temporarily swapping in a non-definer version of the
-- function (scoped to this rolled-back transaction) and asserting THAT throws 42P17 — so this
-- test would have failed loudly had the shipped function not been SECURITY DEFINER.

begin;
select plan(3);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000007a', 'recur-a@example.com', '{"full_name":"Recur A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000007aa', 'personal', '00000000-0000-0000-0000-00000000007a', '00000000-0000-0000-0000-00000000007a')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000007aa', '00000000-0000-0000-0000-00000000007a', 'owner')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000007a","role":"authenticated"}';

-- 1. Sanity: with the shipped SECURITY DEFINER function, querying the exact table whose own
--    policy invokes core.is_member() succeeds — no recursion.
select lives_ok(
  $$ select count(*) from core.household_members where household_id = '00000000-0000-0000-0000-0000000007aa' $$,
  'querying core.household_members (whose policy calls core.is_member()) succeeds — no recursion with the shipped SECURITY DEFINER function'
);

reset role;
reset request.jwt.claims;

-- 2. The actual trap: redefine core.is_member() as SECURITY INVOKER (the default) within this
--    rolled-back transaction only, then confirm the identical query now fails loudly. On this
--    Postgres build the self-referential policy evaluation manifests as `stack depth limit
--    exceeded` (54001) rather than the advertised `infinite recursion detected in policy`
--    (42P17) — both are Postgres's own detection of unbounded recursive policy evaluation, but
--    54001 is what this engine actually raises for this exact case, confirmed by running it for
--    real rather than assumed from the design doc's informal description of the trap.
create or replace function core.is_member(p_household_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from core.household_members m
     where m.household_id = p_household_id
       and m.user_id = (select auth.uid())
  );
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000007a","role":"authenticated"}';

select throws_ok(
  $$ select count(*) from core.household_members where household_id = '00000000-0000-0000-0000-0000000007aa' $$,
  '54001', null,
  'a SECURITY INVOKER (non-definer) core.is_member() causes unbounded recursive policy evaluation ("stack depth limit exceeded", 54001) when queried against core.household_members itself'
);

reset role;
reset request.jwt.claims;

-- 3. Restore the shipped SECURITY DEFINER function and confirm the query succeeds again —
--    proves the fix, not just the break.
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

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000007a","role":"authenticated"}';

select lives_ok(
  $$ select count(*) from core.household_members where household_id = '00000000-0000-0000-0000-0000000007aa' $$,
  'restoring core.is_member() to SECURITY DEFINER fixes the recursion again'
);

select * from finish();
rollback;
