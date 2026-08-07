-- Budget settings: custom reset_day period window, monthly total progress, and
-- include_scheduled_as_spent folding unconfirmed recurring expense occurrences into spent_cents.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000b0001', 'budgets-b@example.com', '{"full_name":"Budgets B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000b00aa', 'personal', '00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000b0001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000b00aa', '00000000-0000-0000-0000-0000000b0001', 'owner')
on conflict do nothing;

-- 1: clamped_day_of_month clamps a reset_day of 31 in a 30-day month (April).
select is(finance.clamped_day_of_month(2026, 4, 31), '2026-04-30'::date, 'clamped_day_of_month clamps day 31 in April to the 30th');

-- 2: with no settings row, budget_period_bounds defaults to reset_day=1, i.e. the calendar month.
select is(
  (select period_start from finance.budget_period_bounds('00000000-0000-0000-0000-0000000b00aa', '2026-08-15'::date)),
  '2026-08-01'::date,
  'default period_start (no settings row) is the 1st of the calendar month'
);

insert into finance.budget_settings (household_id, reset_day)
values ('00000000-0000-0000-0000-0000000b00aa', 20);

-- 3: with reset_day=20, a date on the 15th falls in the PREVIOUS period (started the 20th of last month).
select is(
  (select period_start from finance.budget_period_bounds('00000000-0000-0000-0000-0000000b00aa', '2026-08-15'::date)),
  '2026-07-20'::date,
  'reset_day=20: Aug 15 falls in the period that started Jul 20'
);

-- 4: with reset_day=20, a date on the 25th falls in the period that just started this month.
select is(
  (select period_start from finance.budget_period_bounds('00000000-0000-0000-0000-0000000b00aa', '2026-08-25'::date)),
  '2026-08-20'::date,
  'reset_day=20: Aug 25 falls in the period that started Aug 20'
);

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-0000000b0c01', '00000000-0000-0000-0000-0000000b00aa', 'Renta B Test', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-0000000b0d01', '00000000-0000-0000-0000-0000000b00aa', 'Efectivo B', 'cash', 'household', '00000000-0000-0000-0000-0000000b0001');

insert into finance.budgets (id, household_id, category_id, limit_cents)
values ('00000000-0000-0000-0000-0000000b0e01', '00000000-0000-0000-0000-0000000b00aa', '00000000-0000-0000-0000-0000000b0c01', 100000);

-- 5: a recurring expense due WITHIN the current period is NOT counted when the toggle is off.
insert into finance.recurring_transactions (id, household_id, account_id, category_id, type, amount_cents, description, frequency, next_due_date)
values ('00000000-0000-0000-0000-0000000b0f01', '00000000-0000-0000-0000-0000000b00aa', '00000000-0000-0000-0000-0000000b0d01', '00000000-0000-0000-0000-0000000b0c01', 'expense', 30000, 'Renta', 'monthly', current_date);

select is(
  (select spent_cents::bigint from finance.budget_progress where budget_id = '00000000-0000-0000-0000-0000000b0e01'),
  0::bigint,
  'include_scheduled_as_spent=false: an unconfirmed recurring occurrence does not count as spent'
);

-- 6: turning the toggle on folds it in.
update finance.budget_settings set include_scheduled_as_spent = true where household_id = '00000000-0000-0000-0000-0000000b00aa';

select is(
  (select spent_cents::bigint from finance.budget_progress where budget_id = '00000000-0000-0000-0000-0000000b0e01'),
  30000::bigint,
  'include_scheduled_as_spent=true: the unconfirmed recurring occurrence counts as spent'
);

-- 7: budget_total_progress exists only when monthly_total_cents is set.
select is(
  (select count(*)::int from finance.budget_total_progress where household_id = '00000000-0000-0000-0000-0000000b00aa'),
  0,
  'budget_total_progress has zero rows when monthly_total_cents is null'
);

update finance.budget_settings set monthly_total_cents = 500000 where household_id = '00000000-0000-0000-0000-0000000b00aa';

select is(
  (select spent_cents::bigint from finance.budget_total_progress where household_id = '00000000-0000-0000-0000-0000000b00aa'),
  30000::bigint,
  'budget_total_progress spent_cents includes the scheduled recurring amount once monthly_total_cents is set'
);

-- 8: tenancy — a non-member sees zero settings rows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}';

select is(
  (select count(*)::bigint from finance.budget_settings where household_id = '00000000-0000-0000-0000-0000000b00aa'),
  0::bigint,
  'non-member sees zero rows from finance.budget_settings'
);

select * from finish();
rollback;
