-- Recurring income: type widened to ('expense','transfer','income'). confirm() posts a positive
-- income row using the SAME bare idempotency-key shape as the expense branch (untouched, per the
-- "do not suffix this key" rule already established for the expense branch).
begin;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000f0001', 'income-a@example.com', '{"full_name":"Income A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000f00aa', 'personal', '00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000f00aa', '00000000-0000-0000-0000-0000000f0001', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f00aa', 'Salario Test', 'income');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-0000000f0d01', '00000000-0000-0000-0000-0000000f00aa', 'Efectivo Income', 'cash', 'household', '00000000-0000-0000-0000-0000000f0001');

-- 1: 'income' is now an accepted type value
select lives_ok(
  $$ insert into finance.recurring_transactions
       (id, household_id, account_id, category_id, type, amount_cents, description, frequency, next_due_date)
     values ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f00aa',
             '00000000-0000-0000-0000-0000000f0d01', '00000000-0000-0000-0000-0000000f0c01',
             'income', 500000, 'Salario', 'monthly', current_date) $$,
  'income-type recurring definition is accepted'
);

-- 2: unknown type still rejected
select throws_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, type, amount_cents, description, frequency, next_due_date)
     values ('00000000-0000-0000-0000-0000000f00aa', '00000000-0000-0000-0000-0000000f0d01',
             '00000000-0000-0000-0000-0000000f0c01', 'bogus', 100, 'x', 'monthly', current_date) $$,
  '23514', null,
  'unknown recurring type is still rejected by the CHECK constraint'
);

-- 3: income requires a category (mirrors expense shape)
select throws_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, type, amount_cents, description, frequency, next_due_date)
     values ('00000000-0000-0000-0000-0000000f00aa', '00000000-0000-0000-0000-0000000f0d01',
             null, 'income', 100, 'x', 'monthly', current_date) $$,
  '23514', null,
  'income recurring definition without a category is rejected'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000f0001","role":"authenticated"}';

-- 4: confirm() posts a POSITIVE income transaction
select lives_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000f0e01'::uuid) $$,
  'confirming the income definition succeeds'
);

select is(
  (select amount_cents from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000f00aa' and type = 'income'
      and origin_module = 'recurring' limit 1),
  500000::bigint,
  'confirmed income transaction is posted with a positive amount_cents'
);

-- 5: cursor advanced exactly once
select ok(
  (select next_due_date > current_date from finance.recurring_transactions
    where id = '00000000-0000-0000-0000-0000000f0e01'),
  'next_due_date advanced past today after confirm'
);

select * from finish();
rollback;
