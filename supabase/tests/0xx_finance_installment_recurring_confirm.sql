-- Confirming/discarding the bounded recurring definition created for installments 2..N
-- (finance-installment-recurring redesign): each confirm posts one dated, numbered installment
-- and clamp-advances the cursor by exactly one anchor-day month (not `advance_due_date`'s
-- drifting interval add); the definition auto-deactivates the moment installments_remaining
-- hits 0, and discard consumes an installment the same way confirm does.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000100002', 'installments-b@example.com', '{"full_name":"Installments B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000001000bb', 'personal', '00000000-0000-0000-0000-000000100002', '00000000-0000-0000-0000-000000100002')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000001000bb', '00000000-0000-0000-0000-000000100002', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-000000100c02', '00000000-0000-0000-0000-0000001000bb', 'Compras Test B', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-000000100d03', '00000000-0000-0000-0000-0000001000bb', 'Tarjeta Test B', 'credit_card', 'household', '00000000-0000-0000-0000-000000100002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000100002","role":"authenticated"}';

-- Seed a 4-installment purchase: #1 posts now, definition tracks 3 remaining (2,3,4).
select finance.record_installment_purchase(
  '00000000-0000-0000-0000-000000100d03'::uuid, '00000000-0000-0000-0000-000000100c02'::uuid,
  40000, 4, '2026-01-31'::date, 'Consola'
);

-- 1: confirm posts installment #2, numbered correctly in its description.
select lives_ok(
  $$ select finance.confirm_recurring_transaction(
       (select id from finance.recurring_transactions
         where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null))
  $$,
  'confirming the first due occurrence of the installment definition succeeds'
);

select is(
  (select description from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000bb' and subtype = 'compra_meses' and installment_index = 2),
  'Consola (2/4)',
  'the confirmed transaction is numbered (2/4) in its description'
);

-- 2: the definition now tracks 2 remaining, and next_due_date clamp-advanced to Mar 31 (from the
--    Jan 31 anchor day, month index 3 -> Apr 30... wait: anchor is Jan 31, occurrence 3 is 2
--    months after the anchor = Mar 31).
select is(
  (select (installments_remaining, next_due_date) from finance.recurring_transactions
    where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null),
  (2, '2026-03-31'::date)::record,
  'after confirming #2, 2 remain and the cursor clamp-advances to the Mar 31 anchor date'
);

-- 3: discard consumes installment #3 without posting a transaction.
select lives_ok(
  $$ select finance.discard_recurring_occurrence(
       (select id from finance.recurring_transactions
         where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null))
  $$,
  'discarding the next due installment occurrence succeeds'
);

select is(
  (select count(*)::int from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000bb' and subtype = 'compra_meses'),
  2,
  'discard posts no new transaction — still only installments #1 and #2 exist'
);

select is(
  (select installments_remaining from finance.recurring_transactions
    where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null),
  1,
  'discard also consumes one installment — 1 remains'
);

-- 4: confirming the final (4th) installment auto-deactivates the definition (early-payoff / plan
--    exhaustion is then just letting it run out, or deleting it for an actual early payoff).
select lives_ok(
  $$ select finance.confirm_recurring_transaction(
       (select id from finance.recurring_transactions
         where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null))
  $$,
  'confirming the final installment succeeds'
);

select is(
  (select (installments_remaining, active) from finance.recurring_transactions
    where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null),
  (0, false)::record,
  'the definition auto-deactivates once installments_remaining reaches 0'
);

-- 5: confirming an already-exhausted (paused) installment definition is rejected, same as any
--    other paused recurring definition.
select throws_ok(
  $$ select finance.confirm_recurring_transaction(
       (select id from finance.recurring_transactions
         where household_id = '00000000-0000-0000-0000-0000001000bb' and installment_group_id is not null))
  $$,
  '22023', null,
  'confirming an exhausted (auto-deactivated) installment definition is rejected'
);

select * from finish();
rollback;
