-- pgTAP — core.ensure_personal_space() / app.bootstrap_user() idempotency
-- (design.md §6.2, tasks.md T-012/T-016)
--
-- NOT EXECUTED by this agent — see 010_core_rls.sql header for why.
--
-- This file covers the SEQUENTIAL idempotency guarantee (repeated calls by
-- the same user never duplicate a household/member row). It deliberately
-- does NOT claim to cover the true concurrent-race guarantee described in
-- design.md §6.2 ("two concurrent first sign-ins... Postgres serializes
-- them on the index") — pgTAP runs a single test file inside ONE
-- transaction, so it cannot fork two genuinely concurrent transactions
-- against the same connection. The actual race is exercised instead by
-- `scripts/test-bootstrap-race.sh`, which opens two real concurrent `psql`
-- connections against a running local stack. Both files are required to
-- claim T-012's trap is covered; neither alone is sufficient.

begin;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000c', 'user-c@example.com', '{"full_name":"User C"}')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

-- First call creates profile + household + membership.
select lives_ok(
  $$ select app.bootstrap_user() $$,
  'first app.bootstrap_user() call succeeds'
);

select is(
  (select count(*) from core.households where personal_owner_user_id = '00000000-0000-0000-0000-00000000000c'),
  1::bigint,
  'exactly one personal household exists after the first call'
);

-- Second call (same user, same transaction/session) must be a no-op: no
-- duplicate household, no duplicate membership row, same household id
-- returned both times.
select is(
  (select app.bootstrap_user()),
  (select id from core.households where personal_owner_user_id = '00000000-0000-0000-0000-00000000000c'),
  'second call returns the SAME household id (no duplicate created)'
);

select is(
  (select count(*) from core.households where personal_owner_user_id = '00000000-0000-0000-0000-00000000000c'),
  1::bigint,
  'still exactly one personal household after a second call'
);

select is(
  (select count(*) from core.household_members
    where user_id = '00000000-0000-0000-0000-00000000000c'),
  1::bigint,
  'still exactly one household_members row after a second call'
);

select * from finish();
rollback;
