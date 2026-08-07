-- pgTAP — CC-008 half-pair guard. Pre-insert a row occupying `<due>:in` only, then confirm: the
-- statement raises 40001, the pre-existing row is untouched, no :out sibling is created. Named
-- test for the `v_count = 1` guard in design.md §2.2.
--
-- This deliberately fabricates a structurally-should-never-happen precondition (a lone `:in` leg
-- already posted for an occurrence that hasn't been confirmed yet) via a direct table-owner
-- insert, to drive the `v_count = 1` defensive branch that is otherwise unreachable through the
-- public confirm() seam alone.

begin;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000fe001', 'halfpair-a@example.com', '{"full_name":"HalfPair A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000feaaa', 'halfpair household', '00000000-0000-0000-0000-0000000fe001', '00000000-0000-0000-0000-0000000fe001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000feaaa', '00000000-0000-0000-0000-0000000fe001', 'owner')
on conflict do nothing;

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-0000000fed01', '00000000-0000-0000-0000-0000000feaaa', 'Efectivo HalfPair', 'cash', 'household', '00000000-0000-0000-0000-0000000fe001'),
  ('00000000-0000-0000-0000-0000000fed02', '00000000-0000-0000-0000-0000000feaaa', 'Tarjeta HalfPair', 'credit_card', 'household', '00000000-0000-0000-0000-0000000fe001');

insert into finance.recurring_transactions (id, household_id, account_id, to_account_id, type, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000fee01', '00000000-0000-0000-0000-0000000feaaa', '00000000-0000-0000-0000-0000000fed01', '00000000-0000-0000-0000-0000000fed02', 'transfer', null, 8000, 'Pago HalfPair', 'monthly', current_date, true);

-- Fabricate the impossible precondition: only the `:in` leg exists, as table owner (bypasses RLS
-- and the seam entirely — this row could never be produced by confirm() itself).
insert into finance.transactions
  (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
   created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key, recurring_id)
values
  ('00000000-0000-0000-0000-0000000feaaa', '00000000-0000-0000-0000-0000000fed02', null, 'transfer', 8000,
   current_date, 'orphan :in leg', '00000000-0000-0000-0000-0000000fe001', gen_random_uuid(),
   'recurring', '00000000-0000-0000-0000-0000000fee01', current_date::text || ':in', '00000000-0000-0000-0000-0000000fee01');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000fe001","role":"authenticated"}';

select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000fee01'::uuid) $$,
  '40001', null, 'confirming into a pre-occupied :in-only slot raises 40001 (the v_count=1 defensive guard)'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000feaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fee01'),
  1::bigint, 'exactly the ORIGINAL orphan row remains — the guard rolled back the attempted :out insert'
);

select is(
  (select idempotency_key from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000feaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fee01'),
  current_date::text || ':in', 'the pre-existing :in row is completely untouched'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000feaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fee01'
      and idempotency_key = current_date::text || ':out'),
  0::bigint, 'no :out sibling was ever committed'
);

select * from finish();
rollback;
