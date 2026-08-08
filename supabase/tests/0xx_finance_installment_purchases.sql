-- "Compra a meses": all N installments post atomically in one call, the total splits evenly with
-- the remainder folded into the last installment, dates advance by clamped month arithmetic, and
-- the account must be a credit_card.
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

-- 4: exactly 3 transaction rows were posted.
select is(
  (select count(*)::int from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'),
  3,
  'exactly 3 installment rows are posted for a 3-installment purchase'
);

-- 5: the installments sum to exactly the original total (no rounding drift).
select is(
  (select sum(-amount_cents)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'),
  10000::bigint,
  'the sum of installments equals the original total exactly, no rounding drift'
);

-- 6: the remainder cent lands on the LAST installment (10000/3 = 3333.33 -> 3333,3333,3334).
select is(
  (select amount_cents::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'
      and installment_index = 3),
  -3334::bigint,
  'the remainder cent is folded into the last installment'
);

-- 7: installment dates advance by clamped month arithmetic from Jan 31 (Feb has no 31st).
select is(
  (select occurred_on from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'
      and installment_index = 2),
  '2026-02-28'::date,
  'the 2nd installment date clamps Jan 31 to Feb 28 (no Feb 31)'
);

-- 8: all 3 rows share one installment_group_id.
select is(
  (select count(distinct installment_group_id)::int from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000001000aa' and subtype = 'compra_meses'),
  1,
  'all installments share exactly one installment_group_id'
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
