-- pgTAP — finance.* RLS (design.md §4.2, §4.4, §9 "Database — tenancy", tasks.md T-023/T-033)
--
-- Mandatory cases: (a) member sees own rows, (b) non-member sees zero rows, (c) anon denied,
-- (d) private-account rows invisible to a non-owner member, (e) direct INSERT/UPDATE/DELETE on
-- accounts/transactions as authenticated raises insufficient_privilege (seam-bypass regression).

begin;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000001a', 'fin-a@example.com', '{"full_name":"Fin A"}'),
  ('00000000-0000-0000-0000-00000000001b', 'fin-b@example.com', '{"full_name":"Fin B"}'),
  ('00000000-0000-0000-0000-00000000001c', 'fin-c@example.com', '{"full_name":"Fin C"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000001aa', 'personal', '00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000001a'),
  ('00000000-0000-0000-0000-0000000001bb', 'personal', '00000000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-00000000001b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000001aa', '00000000-0000-0000-0000-00000000001a', 'owner'),
  -- user C is a second member of household A, to test private-account visibility (case d)
  ('00000000-0000-0000-0000-0000000001aa', '00000000-0000-0000-0000-00000000001c', 'member'),
  ('00000000-0000-0000-0000-0000000001bb', '00000000-0000-0000-0000-00000000001b', 'owner')
on conflict do nothing;

-- Seed accounts/categories/transactions directly as table owner (bypasses RLS by design —
-- this is the fixture-setup role, not the impersonated role under test).
insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id, opening_balance_cents)
values
  ('00000000-0000-0000-0000-000000002a01', '00000000-0000-0000-0000-0000000001aa', 'Efectivo A', 'cash', 'household', '00000000-0000-0000-0000-00000000001a', 0),
  ('00000000-0000-0000-0000-000000002a02', '00000000-0000-0000-0000-0000000001aa', 'Privada de A', 'cash', 'private', '00000000-0000-0000-0000-00000000001a', 0),
  ('00000000-0000-0000-0000-000000002b01', '00000000-0000-0000-0000-0000000001bb', 'Efectivo B', 'cash', 'household', '00000000-0000-0000-0000-00000000001b', 0);

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-000000003a01', '00000000-0000-0000-0000-0000000001aa', 'Prueba A', 'expense');

insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, created_by_user_id)
values ('00000000-0000-0000-0000-000000004a01', '00000000-0000-0000-0000-0000000001aa', '00000000-0000-0000-0000-000000002a01', '00000000-0000-0000-0000-000000003a01', 'expense', -500, current_date, '00000000-0000-0000-0000-00000000001a');

-- (a) member A sees own household's rows
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000001a","role":"authenticated"}';

select is((select count(*) from finance.accounts where household_id = '00000000-0000-0000-0000-0000000001aa'), 2::bigint,
  'member A sees both of household A''s accounts (owns the private one)');

select is((select count(*) from finance.categories where household_id = '00000000-0000-0000-0000-0000000001aa'), 1::bigint,
  'member A sees household A category');

select is((select count(*) from finance.transactions where household_id = '00000000-0000-0000-0000-0000000001aa'), 1::bigint,
  'member A sees household A transaction');

-- (b) non-member A sees zero rows from household B
select is((select count(*) from finance.accounts where household_id = '00000000-0000-0000-0000-0000000001bb'), 0::bigint,
  'non-member A sees zero rows from household B accounts');

-- (d) private-account visibility: member C (second member of household A, not the owner of the
-- private account) sees the household-visible account but not the private one.
reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000001c","role":"authenticated"}';

select is((select count(*) from finance.accounts where id = '00000000-0000-0000-0000-000000002a01'), 1::bigint,
  'member C (non-owner) sees the household-visibility account');

select is((select count(*) from finance.accounts where id = '00000000-0000-0000-0000-000000002a02'), 0::bigint,
  'member C (non-owner) does NOT see the private account owned by A');

-- (e) direct DML on accounts/transactions as authenticated is denied — the seam-bypass
-- regression test. finance.categories DOES allow direct INSERT/UPDATE (design.md §4.2), so it
-- is exercised separately below with the opposite expectation.
select throws_ok(
  $$ insert into finance.accounts (household_id, name, type, visibility, owner_user_id)
     values ('00000000-0000-0000-0000-0000000001aa', 'Rogue', 'cash', 'household', '00000000-0000-0000-0000-00000000001c') $$,
  '42501', null, 'direct INSERT on finance.accounts as authenticated is denied'
);

select throws_ok(
  $$ update finance.accounts set name = 'rogue' where id = '00000000-0000-0000-0000-000000002a01' $$,
  '42501', null, 'direct UPDATE on finance.accounts as authenticated is denied'
);

select throws_ok(
  $$ delete from finance.accounts where id = '00000000-0000-0000-0000-000000002a01' $$,
  '42501', null, 'direct DELETE on finance.accounts as authenticated is denied'
);

select throws_ok(
  $$ insert into finance.transactions (household_id, account_id, category_id, type, amount_cents, occurred_on, created_by_user_id)
     values ('00000000-0000-0000-0000-0000000001aa', '00000000-0000-0000-0000-000000002a01', '00000000-0000-0000-0000-000000003a01', 'expense', -100, current_date, '00000000-0000-0000-0000-00000000001c') $$,
  '42501', null, 'direct INSERT on finance.transactions as authenticated is denied'
);

select throws_ok(
  $$ delete from finance.transactions where id = '00000000-0000-0000-0000-000000004a01' $$,
  '42501', null, 'direct DELETE on finance.transactions as authenticated is denied (no policy, DELETE also revoked)'
);

-- finance.categories: the deliberate exception — plain user-owned reference data, direct
-- RLS-guarded CRUD is allowed (design.md §4.2).
select lives_ok(
  $$ insert into finance.categories (household_id, name, kind) values ('00000000-0000-0000-0000-0000000001aa', 'Otra C', 'expense') $$,
  'direct INSERT on finance.categories as a member IS allowed'
);

select throws_ok(
  $$ delete from finance.categories where household_id = '00000000-0000-0000-0000-0000000001aa' $$,
  '42501', null, 'direct DELETE on finance.categories is denied (no DELETE grant/policy — archive only)'
);

-- (c) anon is denied at the schema-usage level, same shape as core (010_core_rls.sql).
reset role;
reset request.jwt.claims;
set local role anon;

select throws_ok(
  $$ select count(*) from finance.accounts $$,
  '42501', null, 'anon is denied schema-level access to finance.accounts'
);

select throws_ok(
  $$ select count(*) from finance.transactions $$,
  '42501', null, 'anon is denied schema-level access to finance.transactions'
);

select throws_ok(
  $$ select count(*) from finance.categories $$,
  '42501', null, 'anon is denied schema-level access to finance.categories'
);

select throws_ok(
  $$ select count(*) from finance.category_templates $$,
  '42501', null, 'anon is denied schema-level access to finance.category_templates'
);

select * from finish();
rollback;
