-- "Compra a meses": only installment #1 posts as a real transaction immediately; installments
-- 2..N become a single bounded `finance.recurring_transactions` definition instead of N-1 more
-- posted rows with future `occurred_on` dates (redesign, finance-installment-recurring). This
-- closes a real bug: `finance.account_balances` sums ALL posted transactions with no date filter,
-- so posting every future installment today inflated the card's shown debt by the full future
-- total. The remainder cent now folds into installment #1 (the only row this RPC controls
-- directly), and the account must still be a credit_card.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000100001', 'installments-a@example.com', '{"full_name":"Installments A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000001000aa', 'personal', '00000000-0000-0000-0000-000000100001', '00000000-0000-0000-0000-000000100001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000001000aa', '00000000-0000-0000-0000-000000100001', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-000000100c01', '00000000-0000-0000-0000-0000001000aa', 'Compras Test', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-000000100d01', '00000000-0000-0000-0000-0000001000aa', 'Tarjeta Test', 'credit_card', 'household', '00000000-0000-0000-0000-000000100001');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-000000100d02', '00000000-0000-0000-0000-0000001000aa', 'Efectivo Test', 'cash', 'household', '00000000-0000-0000-0000-000000100001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000100001","role":"authenticated"}';

-- 1: rejects a non-credit_card account.
select throws_ok(
  $$ select finance.record_installment_purchase('00000000-0000-0000-0000-000000100d02'::uuid, '00000000-0000-0000-0000-000000100c01'::uuid, 100000, 3, current_date, 'x') $$,
  '22023', null,
  'installment purchase on a non-credit_card account is rejected'
);

-- 2: rejects a count below 2.
select throws_ok(
  $$ select finance.record_installment_purchase('00000000-0000-0000-0000-000000100d01'::uuid, '00000000-0000-0000-0000-000000100c01'::uuid, 100000, 1, current_date, 'x') $$,
  '22023', null,
  'installment count below 2 is rejected'
);

-- 3: succeeds for a valid 3-installment purchase of 10000 cents (splits 3334/3333/3333).
select lives_ok(
  $$ select finance.record_installment_purchase('00000000-0000-0000-0000-000000100d01'::uuid, '00000000-0000-0000-0000-000000100c01'::uuid, 10000, 3, '2026-01-31'::date, 'Laptop') $$,
  'a valid installment purchase succeeds'
);

-- 4: exactly ONE transaction row posts immediately — not all 3.
select is(
  (select count(*)::int from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'),
  1,
  'exactly 1 installment row posts immediately for a 3-installment purchase'
);

-- 5: that one row carries the remainder cent (10000/3 = 3333.33 -> first gets 3334).
select is(
  (select amount_cents::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'
      and installment_index = 1),
  -3334::bigint,
  'the remainder cent is folded into installment #1, the only row posted now'
);

-- 6: exactly ONE bounded recurring definition was created for installments 2..3.
select is(
  (select count(*)::int from finance.recurring_transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and installment_group_id is not null),
  1,
  'exactly one recurring definition represents the remaining installments'
);

-- 7: the recurring definition tracks 2 remaining occurrences of a 3-installment total, at the
--    fixed base amount (3333), and its first due date clamps Jan 31 -> Feb 28 (no Feb 31).
select is(
  (select (installments_remaining, installment_total, amount_cents::bigint, next_due_date)
     from finance.recurring_transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and installment_group_id is not null),
  (2, 3, 3333::bigint, '2026-02-28'::date)::record,
  'the recurring definition tracks 2/3 remaining at 3333 cents, next due 2026-02-28'
);

-- 8: the recurring definition shares the SAME installment_group_id as installment #1.
select is(
  (select r.installment_group_id from finance.recurring_transactions r
    where r.household_id = '00000000-0000-0000-0000-0000001000aa' and r.installment_group_id is not null),
  (select t.installment_group_id from finance.transactions t
    where t.household_id = '00000000-0000-0000-0000-0000001000aa' and t.subtype = 'compra_meses'
      and t.installment_index = 1),
  'the recurring definition and installment #1 share one installment_group_id'
);

-- 9: tenancy — a non-member cannot call the RPC against this household's account.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}';

select throws_ok(
  $$ select finance.record_installment_purchase('00000000-0000-0000-0000-000000100d01'::uuid, '00000000-0000-0000-0000-000000100c01'::uuid, 10000, 3, current_date, 'x') $$,
  '42501', null,
  'a non-member cannot record an installment purchase against this household'
);

select * from finish();
rollback;
