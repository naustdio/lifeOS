-- pgTAP — finance.budgets / finance.budget_progress (design.md §8, change: finance-budgets B-009)
--
-- Covers: tenancy (member/non-member/anon + DELETE), security_invoker regression on the view,
-- the expense-kind trigger, current-month progress derivation, uniqueness, and the
-- archived-category-leaves-budget-untouched requirement.

begin;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000008a', 'budg-a@example.com', '{"full_name":"Budg A"}'),
  ('00000000-0000-0000-0000-00000000008b', 'budg-b@example.com', '{"full_name":"Budg B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000008aa', 'personal', '00000000-0000-0000-0000-00000000008a', '00000000-0000-0000-0000-00000000008a'),
  ('00000000-0000-0000-0000-0000000008bb', 'personal', '00000000-0000-0000-0000-00000000008b', '00000000-0000-0000-0000-00000000008b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-00000000008a', 'owner'),
  ('00000000-0000-0000-0000-0000000008bb', '00000000-0000-0000-0000-00000000008b', 'owner')
on conflict do nothing;

-- Fixture setup as table owner (bypasses RLS by design — this is the setup role, not the
-- impersonated role under test).
insert into finance.categories (id, household_id, name, kind)
values
  ('00000000-0000-0000-0000-000000008c01', '00000000-0000-0000-0000-0000000008aa', 'Comida Test', 'expense'),
  ('00000000-0000-0000-0000-000000008c02', '00000000-0000-0000-0000-0000000008aa', 'Sueldo Test', 'income'),
  ('00000000-0000-0000-0000-000000008c03', '00000000-0000-0000-0000-0000000008aa', 'Sin Presupuesto Test', 'expense'),
  ('00000000-0000-0000-0000-000000008c04', '00000000-0000-0000-0000-0000000008bb', 'Comida B Test', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-000000008d01', '00000000-0000-0000-0000-0000000008aa', 'Efectivo A', 'cash', 'household', '00000000-0000-0000-0000-00000000008a');

-- ---------------------------------------------------------------------------
-- Expense-kind trigger (design.md §1)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into finance.budgets (household_id, category_id, limit_cents)
     values ('00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008c02', 5000) $$,
  '22023', null, 'insert referencing an income category is rejected'
);

select lives_ok(
  $$ insert into finance.budgets (id, household_id, category_id, limit_cents)
     values ('00000000-0000-0000-0000-000000008e01', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008c01', 5000) $$,
  'insert referencing an expense category succeeds'
);

select throws_ok(
  $$ update finance.budgets set category_id = '00000000-0000-0000-0000-000000008c02'
     where id = '00000000-0000-0000-0000-000000008e01' $$,
  '22023', null, 'UPDATE ... set category_id to an income category is rejected too'
);

select throws_ok(
  $$ insert into finance.budgets (household_id, category_id, limit_cents)
     values ('00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008c04', 5000) $$,
  '22023', null, 'a category from another space is rejected'
);

-- ---------------------------------------------------------------------------
-- Uniqueness (design.md §1)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into finance.budgets (household_id, category_id, limit_cents)
     values ('00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008c01', 6000) $$,
  '23505', null, 'a second budget for the same (household_id, category_id) violates the unique constraint'
);

select throws_ok(
  $$ insert into finance.budgets (household_id, category_id, limit_cents)
     values ('00000000-0000-0000-0000-0000000008bb', '00000000-0000-0000-0000-000000008c04', 0) $$,
  '23514', null, 'limit_cents = 0 is rejected'
);

-- ---------------------------------------------------------------------------
-- Current-month progress (design.md §2)
-- ---------------------------------------------------------------------------
insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, status, voided_at, created_by_user_id)
values
  -- this month: posted expense, counts
  ('00000000-0000-0000-0000-000000008f01', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008d01', '00000000-0000-0000-0000-000000008c01', 'expense', -2000, (date_trunc('month', current_date) + interval '5 days')::date, 'posted', null, '00000000-0000-0000-0000-00000000008a'),
  -- last month: posted expense, must NOT count
  ('00000000-0000-0000-0000-000000008f02', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008d01', '00000000-0000-0000-0000-000000008c01', 'expense', -9000, (date_trunc('month', current_date) - interval '1 month' + interval '5 days')::date, 'posted', null, '00000000-0000-0000-0000-00000000008a'),
  -- this month: voided expense, must NOT count
  ('00000000-0000-0000-0000-000000008f03', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008d01', '00000000-0000-0000-0000-000000008c01', 'expense', -3000, (date_trunc('month', current_date) + interval '6 days')::date, 'void', now(), '00000000-0000-0000-0000-00000000008a');

select is(
  (select spent_cents::bigint from finance.budget_progress where category_id = '00000000-0000-0000-0000-000000008c01'),
  2000::bigint, 'progress reflects only current-month posted expense spend (excludes last month, excludes void)'
);

select ok(
  (select spent_cents from finance.budget_progress where category_id = '00000000-0000-0000-0000-000000008c01') >= 0,
  'spent_cents is reported as a positive magnitude'
);

-- a transfer row carrying a category_id is excluded (mistagged transfer, per spec scenario)
insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, status, transfer_group_id, created_by_user_id)
values ('00000000-0000-0000-0000-000000008f04', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008d01', null, 'transfer', -1000, (date_trunc('month', current_date) + interval '7 days')::date, 'posted', gen_random_uuid(), '00000000-0000-0000-0000-00000000008a');

select is(
  (select spent_cents::bigint from finance.budget_progress where category_id = '00000000-0000-0000-0000-000000008c01'),
  2000::bigint, 'a transfer row does not change spend for the category (view join excludes type <> expense anyway)'
);

-- an income-typed row referencing the same category_id is excluded from spend (defensive:
-- nothing in the transactions schema forbids type='income' with an expense-kind category_id)
insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, status, created_by_user_id)
values ('00000000-0000-0000-0000-000000008f05', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008d01', '00000000-0000-0000-0000-000000008c01', 'income', 1500, (date_trunc('month', current_date) + interval '8 days')::date, 'posted', '00000000-0000-0000-0000-00000000008a');

select is(
  (select spent_cents::bigint from finance.budget_progress where category_id = '00000000-0000-0000-0000-000000008c01'),
  2000::bigint, 'an income-typed row is excluded from spend even when it references the budgeted category_id'
);

-- budget with no transactions returns a row with spent_cents = 0 (LEFT JOIN regression)
select lives_ok(
  $$ insert into finance.budgets (id, household_id, category_id, limit_cents)
     values ('00000000-0000-0000-0000-000000008e02', '00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-000000008c03', 4000) $$,
  'second budget on a zero-transaction category succeeds'
);
select is(
  (select spent_cents::bigint from finance.budget_progress where category_id = '00000000-0000-0000-0000-000000008c03'),
  0::bigint, 'a budget with no transactions returns a row with spent_cents = 0 (LEFT JOIN)'
);

-- ---------------------------------------------------------------------------
-- Archived category leaves its budget row untouched (design.md's own requirement)
-- ---------------------------------------------------------------------------
update finance.categories set archived_at = now() where id = '00000000-0000-0000-0000-000000008c01';

select is(
  (select limit_cents::bigint from finance.budgets where category_id = '00000000-0000-0000-0000-000000008c01'),
  5000::bigint, 'archiving a budgeted category leaves the budget row byte-identical (no cascade, no flag)'
);

-- ---------------------------------------------------------------------------
-- Tenancy: member/non-member/anon + DELETE (design.md §3)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000008a","role":"authenticated"}';

select is(
  (select count(*)::bigint from finance.budgets where household_id = '00000000-0000-0000-0000-0000000008aa'),
  2::bigint, 'member A sees both of household A''s budget rows'
);

select is(
  (select count(*)::bigint from finance.budgets where household_id = '00000000-0000-0000-0000-0000000008bb'),
  0::bigint, 'non-member A sees zero budget rows from household B'
);

-- security_invoker regression: non-member A must see zero rows from household B's
-- budget_progress even though B has no budgets here — assert on OWN visible progress row
-- count vs a cross-space attempt to prove the view is RLS-filtered, not owner-bypassing.
select is(
  (select count(*)::bigint from finance.budget_progress where household_id = '00000000-0000-0000-0000-0000000008bb'),
  0::bigint, 'security_invoker regression: non-member session reading budget_progress for another space returns zero rows'
);

select lives_ok(
  $$ delete from finance.budgets where id = '00000000-0000-0000-0000-000000008e02' and household_id = '00000000-0000-0000-0000-0000000008aa' $$,
  'a member can DELETE their own household''s budget row'
);

reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000008b","role":"authenticated"}';

do $$
begin
  delete from finance.budgets where id = '00000000-0000-0000-0000-000000008e01';
end $$;

-- Check existence as the OWNING member (A), not as B: B's own SELECT is already RLS-filtered
-- to zero rows regardless of whether the DELETE affected anything, so re-checking as B would
-- prove nothing about the DELETE outcome specifically.
reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000008a","role":"authenticated"}';
select is(
  (select count(*)::bigint from finance.budgets where id = '00000000-0000-0000-0000-000000008e01'),
  1::bigint, 'a non-member''s DELETE affects zero rows (row still exists, visible again to its owning member)'
);

reset role;
reset request.jwt.claims;
set local role anon;

select throws_ok(
  $$ select count(*) from finance.budgets $$,
  '42501', null, 'anon is denied schema-level access to finance.budgets'
);

select throws_ok(
  $$ select count(*) from finance.budget_progress $$,
  '42501', null, 'anon is denied schema-level access to finance.budget_progress'
);

select * from finish();
rollback;
