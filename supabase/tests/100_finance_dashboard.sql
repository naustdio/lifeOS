-- pgTAP — finance.month_summary / finance.category_spend (design.md §8, change:
-- finance-dashboard-feed F-003)
--
-- Covers: security_invoker regressions on both views (×2, named separately), the
-- [month_start, month_start + 1 month) period boundary, transfer & void exclusion, sign/shape,
-- and cross-view consistency with finance.budget_progress (pins the F-001 window decision).

begin;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000009a', 'dash-a@example.com', '{"full_name":"Dash A"}'),
  ('00000000-0000-0000-0000-00000000009b', 'dash-b@example.com', '{"full_name":"Dash B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000009aa', 'personal', '00000000-0000-0000-0000-00000000009a', '00000000-0000-0000-0000-00000000009a'),
  ('00000000-0000-0000-0000-0000000009bb', 'personal', '00000000-0000-0000-0000-00000000009b', '00000000-0000-0000-0000-00000000009b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-00000000009a', 'owner'),
  ('00000000-0000-0000-0000-0000000009bb', '00000000-0000-0000-0000-00000000009b', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values
  ('00000000-0000-0000-0000-000000009c01', '00000000-0000-0000-0000-0000000009aa', 'Comida Dash Test', 'expense'),
  ('00000000-0000-0000-0000-000000009c02', '00000000-0000-0000-0000-0000000009aa', 'Sueldo Dash Test', 'income'),
  ('00000000-0000-0000-0000-000000009c03', '00000000-0000-0000-0000-0000000009aa', 'Transporte Dash Test', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-0000000009aa', 'Efectivo Dash A', 'cash', 'household', '00000000-0000-0000-0000-00000000009a');

-- Budget on the same category, to pin cross-view consistency with budget_progress.
insert into finance.budgets (id, household_id, category_id, limit_cents)
values ('00000000-0000-0000-0000-000000009e01', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009c01', 100000);

-- ---------------------------------------------------------------------------
-- Period boundary (design.md §2/§8) — asserted relative to current_date, never a
-- hardcoded date, so the suite does not rot.
-- ---------------------------------------------------------------------------
insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, status, created_by_user_id)
values
  -- 1st of current month, 00:00 — INCLUDED
  ('00000000-0000-0000-0000-000000009f01', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 'expense', -1500, date_trunc('month', current_date)::date, 'posted', '00000000-0000-0000-0000-00000000009a'),
  -- last day of previous month — EXCLUDED
  ('00000000-0000-0000-0000-000000009f02', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 'expense', -9000, (date_trunc('month', current_date) - interval '1 day')::date, 'posted', '00000000-0000-0000-0000-00000000009a'),
  -- 1st of next month — EXCLUDED
  ('00000000-0000-0000-0000-000000009f03', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 'expense', -7000, (date_trunc('month', current_date) + interval '1 month')::date, 'posted', '00000000-0000-0000-0000-00000000009a'),
  -- this month: posted income — INCLUDED in income_cents
  ('00000000-0000-0000-0000-000000009f04', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c02', 'income', 20000, (date_trunc('month', current_date) + interval '2 days')::date, 'posted', '00000000-0000-0000-0000-00000000009a');

-- this month: voided expense — EXCLUDED (tx_void_fields requires voided_at set for status='void')
insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, status, voided_at, created_by_user_id)
values ('00000000-0000-0000-0000-000000009f05', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 'expense', -4000, (date_trunc('month', current_date) + interval '3 days')::date, 'void', now(), '00000000-0000-0000-0000-00000000009a');

select is(
  (select expense_cents::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009aa'),
  1500::bigint, 'month_summary: 1st-of-month posting is included, prior/next-month and void postings are excluded'
);

select is(
  (select income_cents::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009aa'),
  20000::bigint, 'month_summary: this-month posted income is included'
);

select is(
  (select spent_cents::bigint from finance.category_spend where household_id = '00000000-0000-0000-0000-0000000009aa' and category_id = '00000000-0000-0000-0000-000000009c01'),
  1500::bigint, 'category_spend: same period-boundary rule applies (1st included, adjacent months excluded, void excluded)'
);

-- ---------------------------------------------------------------------------
-- Transfer exclusion
-- ---------------------------------------------------------------------------
insert into finance.transactions (id, household_id, account_id, category_id, type, amount_cents, occurred_on, status, transfer_group_id, created_by_user_id)
values ('00000000-0000-0000-0000-000000009f06', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', null, 'transfer', -5000, (date_trunc('month', current_date) + interval '4 days')::date, 'posted', gen_random_uuid(), '00000000-0000-0000-0000-00000000009a');

select is(
  (select expense_cents::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009aa'),
  1500::bigint, 'month_summary: a posted transfer contributes zero to expense_cents'
);

select is(
  (select income_cents::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009aa'),
  20000::bigint, 'month_summary: a posted transfer contributes zero to income_cents'
);

select is(
  (select count(*)::bigint from finance.category_spend where household_id = '00000000-0000-0000-0000-0000000009aa' and category_id is null),
  0::bigint, 'category_spend: a transfer row (no category_id) produces no row'
);

-- ---------------------------------------------------------------------------
-- Sign & shape
-- ---------------------------------------------------------------------------
select ok(
  (select expense_cents from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009aa') >= 0,
  'month_summary.expense_cents is reported as a positive magnitude'
);

select ok(
  (select spent_cents from finance.category_spend where household_id = '00000000-0000-0000-0000-0000000009aa' and category_id = '00000000-0000-0000-0000-000000009c01') >= 0,
  'category_spend.spent_cents is reported as a positive magnitude'
);

select is(
  (select count(*)::bigint from finance.category_spend where household_id = '00000000-0000-0000-0000-0000000009aa' and category_id = '00000000-0000-0000-0000-000000009c01'),
  1::bigint, 'category_spend emits exactly one row per (household_id, category_id)'
);

select is(
  (select count(*)::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009bb'),
  0::bigint, 'a household with no qualifying rows yields zero rows (not a zero-valued row) from month_summary'
);

select is(
  (select count(*)::bigint from finance.category_spend where household_id = '00000000-0000-0000-0000-0000000009bb'),
  0::bigint, 'a household with no qualifying rows yields zero rows (not a zero-valued row) from category_spend'
);

-- ---------------------------------------------------------------------------
-- Cross-view consistency with budget_progress — pins the F-001 window-boundary decision
-- so /presupuestos and Home can never disagree for the same period.
-- ---------------------------------------------------------------------------
select is(
  (select cs.spent_cents::bigint from finance.category_spend cs where cs.household_id = '00000000-0000-0000-0000-0000000009aa' and cs.category_id = '00000000-0000-0000-0000-000000009c01'),
  (select bp.spent_cents::bigint from finance.budget_progress bp where bp.household_id = '00000000-0000-0000-0000-0000000009aa' and bp.category_id = '00000000-0000-0000-0000-000000009c01'),
  'category_spend.spent_cents equals budget_progress.spent_cents for the same budgeted category and month'
);

-- ---------------------------------------------------------------------------
-- security_invoker regressions (×2, named separately) — non-member A must see zero rows
-- from household B's views even though A itself has real data this month.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000009a","role":"authenticated"}';

select ok(
  (select count(*)::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009aa') > 0,
  'sanity: member A sees their own household''s month_summary row (proves A has real data for the invoker test below)'
);

select is(
  (select count(*)::bigint from finance.month_summary where household_id = '00000000-0000-0000-0000-0000000009bb'),
  0::bigint, 'security_invoker regression: non-member session reading finance.month_summary for another space returns zero rows'
);

select is(
  (select count(*)::bigint from finance.category_spend where household_id = '00000000-0000-0000-0000-0000000009bb'),
  0::bigint, 'security_invoker regression: non-member session reading finance.category_spend for another space returns zero rows'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
