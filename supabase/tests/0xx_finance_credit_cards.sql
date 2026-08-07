-- pgTAP — finance.account_credit_card_details / finance.credit_card_status
-- (20260804090023_finance_credit_cards.sql, 20260804090024_finance_credit_cards_security.sql).
-- Change: finance-credit-card-payments, tasks.md CC-015.
--
-- Covers: type-gate trigger, cascade delete, has_terms=false empty state (all-NULL derived
-- columns), tenancy (select/insert/update/delete + anon + view leakage), day-clamp helpers.

begin;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000cc001', 'cc-a@example.com', '{"full_name":"CC A"}'),
  ('00000000-0000-0000-0000-0000000cc002', 'cc-b@example.com', '{"full_name":"CC B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000ccaaa', 'cc household A', '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000cc001'),
  ('00000000-0000-0000-0000-0000000ccbbb', 'cc household B', '00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000cc002')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000ccaaa', '00000000-0000-0000-0000-0000000cc001', 'owner'),
  ('00000000-0000-0000-0000-0000000ccbbb', '00000000-0000-0000-0000-0000000cc002', 'owner')
on conflict do nothing;

-- Seed accounts as table owner (bypasses RLS by design — fixture setup, not the role under test).
insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-0000000ccc01', '00000000-0000-0000-0000-0000000ccaaa', 'Tarjeta A', 'credit_card', 'household', '00000000-0000-0000-0000-0000000cc001'),
  ('00000000-0000-0000-0000-0000000ccc02', '00000000-0000-0000-0000-0000000ccaaa', 'Efectivo A', 'cash', 'household', '00000000-0000-0000-0000-0000000cc001'),
  ('00000000-0000-0000-0000-0000000ccc03', '00000000-0000-0000-0000-0000000ccaaa', 'Tarjeta A Sin Terminos', 'credit_card', 'household', '00000000-0000-0000-0000-0000000cc001');

-- ---------------------------------------------------------------------------
-- Type-gate trigger + cascade delete (table-owner role, proves shape not tenancy).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into finance.account_credit_card_details (account_id, credit_limit_cents)
     values ('00000000-0000-0000-0000-0000000ccc02', 100000) $$,
  '22023', 'card terms apply only to credit_card accounts', 'detail row on a non-credit_card account is rejected by the trigger'
);

select lives_ok(
  $$ insert into finance.account_credit_card_details (account_id, credit_limit_cents, statement_day, due_day, min_payment_cents)
     values ('00000000-0000-0000-0000-0000000ccc01', 500000, 5, 20, 20000) $$,
  'detail row on a credit_card account is accepted'
);

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-0000000ccc04', '00000000-0000-0000-0000-0000000ccaaa', 'Tarjeta A Para Borrar', 'credit_card', 'household', '00000000-0000-0000-0000-0000000cc001');
insert into finance.account_credit_card_details (account_id, credit_limit_cents)
values ('00000000-0000-0000-0000-0000000ccc04', 100000);

delete from finance.accounts where id = '00000000-0000-0000-0000-0000000ccc04';

select is(
  (select count(*) from finance.account_credit_card_details where account_id = '00000000-0000-0000-0000-0000000ccc04'),
  0::bigint, 'deleting the account cascades the detail row'
);

-- ---------------------------------------------------------------------------
-- Empty state: a card with no detail row has has_terms=false and all-NULL derived columns.
-- ---------------------------------------------------------------------------
select is(
  (select has_terms from finance.credit_card_status where account_id = '00000000-0000-0000-0000-0000000ccc03'),
  false, 'a card with no detail row has has_terms=false'
);

select ok(
  (select credit_limit_cents is null and statement_day is null and due_day is null
          and min_payment_cents is null and next_due_date is null and days_until_due is null
          and utilization_bp is null and over_limit is false
     from finance.credit_card_status where account_id = '00000000-0000-0000-0000-0000000ccc03'),
  'a card with no detail row has all derived columns NULL (never NaN)'
);

-- ---------------------------------------------------------------------------
-- Tenancy: select/insert/update/delete as member vs. non-member, anon, view leakage.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000cc001","role":"authenticated"}';

select is(
  (select count(*) from finance.account_credit_card_details where account_id = '00000000-0000-0000-0000-0000000ccc01'),
  1::bigint, 'member A selects their own card''s detail row'
);

reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000cc002","role":"authenticated"}';

select is(
  (select count(*) from finance.account_credit_card_details where account_id = '00000000-0000-0000-0000-0000000ccc01'),
  0::bigint, 'non-member B sees zero rows for household A''s card detail'
);

-- The type-gate trigger (finance.enforce_card_detail_account_type) is a plain function, not
-- SECURITY DEFINER, so its own `exists (select 1 from finance.accounts ...)` lookup runs under
-- B's RLS too. B cannot see household A's account at all, so the trigger's existence check
-- fails first and raises 22023 rather than reaching the INSERT policy's 42501 — the same
-- "not found" precedent as finance.enforce_budget_category(). The account is unreachable
-- either way; only the sqlstate differs from the WITH CHECK path.
select throws_ok(
  $$ insert into finance.account_credit_card_details (account_id, credit_limit_cents)
     values ('00000000-0000-0000-0000-0000000ccc03', 100000) $$,
  '22023', 'card terms apply only to credit_card accounts', 'non-member B cannot insert a detail row on household A''s card (blocked upstream of RLS by the RLS-invisible account lookup)'
);

-- UPDATE/DELETE under a USING-only RLS policy do not throw when the target row is invisible —
-- they silently affect zero rows (Postgres RLS semantics: USING filters, it does not deny).
-- DELETE/UPDATE-without-any-policy (finance.accounts) is the case that throws 42501, because
-- that table has no delete policy at all; account_credit_card_details DOES have one, so a
-- non-matching row is just excluded from the row set, not rejected. A data-modifying CTE cannot
-- be nested inside `is()`'s subquery argument (must be top-level), so run the statement directly
-- and verify the value is unchanged afterward, back under the owning role.
update finance.account_credit_card_details set credit_limit_cents = 1
 where account_id = '00000000-0000-0000-0000-0000000ccc01';

delete from finance.account_credit_card_details
 where account_id = '00000000-0000-0000-0000-0000000ccc01';

reset role;
reset request.jwt.claims;

select is(
  (select credit_limit_cents from finance.account_credit_card_details where account_id = '00000000-0000-0000-0000-0000000ccc01'),
  500000::bigint, 'non-member B''s update+delete of household A''s card detail row affected zero rows (value unchanged, row still exists)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000cc002","role":"authenticated"}';

select is(
  (select count(*) from finance.credit_card_status where account_id = '00000000-0000-0000-0000-0000000ccc01'),
  0::bigint, 'credit_card_status leaks no row from another household (security_invoker proof)'
);

reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000cc001","role":"authenticated"}';

select lives_ok(
  $$ update finance.account_credit_card_details set credit_limit_cents = 600000 where account_id = '00000000-0000-0000-0000-0000000ccc01' $$,
  'member A can update their own card''s detail row'
);

select lives_ok(
  $$ delete from finance.account_credit_card_details where account_id = '00000000-0000-0000-0000-0000000ccc01' $$,
  'member A can delete their own card''s detail row'
);

reset role;
reset request.jwt.claims;
set local role anon;

select throws_ok(
  $$ select count(*) from finance.account_credit_card_details $$,
  '42501', null, 'anon is denied schema-level access to finance.account_credit_card_details'
);

reset role;

-- ---------------------------------------------------------------------------
-- Day-clamp helpers (table-owner role — pure functions, no RLS involved).
-- ---------------------------------------------------------------------------
select is(
  finance.next_card_due_date(31, '2026-02-10'::date), '2026-02-28'::date,
  'due_day 31 in February 2026 (non-leap) clamps to the 28th'
);

select is(
  finance.next_card_due_date(31, '2028-02-01'::date), '2028-02-29'::date,
  'due_day 31 in February 2028 (leap year) clamps to the 29th'
);

select is(
  finance.next_card_due_date(15, '2026-08-20'::date), '2026-09-15'::date,
  'due_day 15 when today is the 20th rolls to next month'
);

select is(
  finance.next_card_due_date(20, '2026-08-20'::date), '2026-08-20'::date,
  'due_day 20 when today is the 20th resolves to today'
);

select * from finish();
rollback;
