-- pgTAP — the two new shape CHECKs added by 20260804090021_finance_recurring_transfer_shape.sql
-- (design.md §1b, tasks.md CC-002). Runs as table owner (bypasses RLS by design — this file
-- proves constraint shape, not tenancy; tenancy is covered by 0xx_finance_recurring_transfer_tenancy.sql).

begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000fa001', 'shape-a@example.com', '{"full_name":"Shape A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000faaaa', 'shape household', '00000000-0000-0000-0000-0000000fa001', '00000000-0000-0000-0000-0000000fa001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fa001', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-0000000fac01', '00000000-0000-0000-0000-0000000faaaa', 'Shape Cat', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-0000000fad01', '00000000-0000-0000-0000-0000000faaaa', 'Efectivo Shape', 'cash', 'household', '00000000-0000-0000-0000-0000000fa001'),
  ('00000000-0000-0000-0000-0000000fad02', '00000000-0000-0000-0000-0000000faaaa', 'Tarjeta Shape', 'credit_card', 'household', '00000000-0000-0000-0000-0000000fa001');

-- ---------------------------------------------------------------------------
-- Regression: the `default 'expense'` ALTER is a no-op for every pre-existing row.
-- ---------------------------------------------------------------------------
insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000fae01', '00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fad01', '00000000-0000-0000-0000-0000000fac01', 5000, 'Legacy expense def', 'monthly', current_date, true);

select is(
  (select type from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fae01'),
  'expense', 'a row inserted without specifying type defaults to expense (ALTER is a no-op)'
);

select is(
  (select to_account_id from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fae01'),
  null, 'a pre-existing-shaped row has to_account_id null'
);

select ok(
  (select true from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fae01'),
  'a pre-existing-shaped row satisfies both new CHECKs without modification (no violation raised on insert)'
);

-- ---------------------------------------------------------------------------
-- Mutual exclusion by type
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, to_account_id, type, amount_cents, description, frequency, next_due_date)
     values
       ('00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fad01',
        '00000000-0000-0000-0000-0000000fac01', '00000000-0000-0000-0000-0000000fad02',
        'transfer', 4000, 'bad: transfer with category', 'monthly', current_date) $$,
  '23514', null, 'type=transfer WITH category_id set is rejected'
);

select throws_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, to_account_id, type, amount_cents, description, frequency, next_due_date)
     values
       ('00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fad01',
        null, null,
        'transfer', 4000, 'bad: transfer with no destination', 'monthly', current_date) $$,
  '23514', null, 'type=transfer WITH to_account_id null is rejected'
);

select throws_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, to_account_id, type, amount_cents, description, frequency, next_due_date)
     values
       ('00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fad01',
        null, '00000000-0000-0000-0000-0000000fad01',
        'transfer', 4000, 'bad: transfer to itself', 'monthly', current_date) $$,
  '23514', null, 'type=transfer WITH to_account_id = account_id is rejected'
);

select throws_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, to_account_id, type, amount_cents, description, frequency, next_due_date)
     values
       ('00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fad01',
        null, null,
        'expense', 4000, 'bad: expense with no category', 'monthly', current_date) $$,
  '23514', null, 'type=expense WITH category_id null is rejected'
);

-- Valid transfer-type definition: proves the shape CHECKs accept the correct shape.
select lives_ok(
  $$ insert into finance.recurring_transactions
       (household_id, account_id, category_id, to_account_id, type, amount_cents, description, frequency, next_due_date)
     values
       ('00000000-0000-0000-0000-0000000faaaa', '00000000-0000-0000-0000-0000000fad01',
        null, '00000000-0000-0000-0000-0000000fad02',
        'transfer', 4000, 'good: valid transfer def', 'monthly', current_date) $$,
  'a correctly-shaped type=transfer definition (no category, distinct to_account_id) is accepted'
);

select * from finish();
rollback;
