-- pgTAP — CC-006 pair atomicity. Confirming a type=transfer definition posts exactly 2 rows,
-- opposite signs, sum 0, one shared transfer_group_id, category_id null, both recurring_id set.
-- Forcing a 2nd-leg failure leaves zero rows and an unadvanced cursor. Per design.md §2.2/§2.1.

begin;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000fc001', 'atom-a@example.com', '{"full_name":"Atom A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000fcaaa', 'atom household', '00000000-0000-0000-0000-0000000fc001', '00000000-0000-0000-0000-0000000fc001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000fcaaa', '00000000-0000-0000-0000-0000000fc001', 'owner')
on conflict do nothing;

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-0000000fcd01', '00000000-0000-0000-0000-0000000fcaaa', 'Efectivo Atom', 'cash', 'household', '00000000-0000-0000-0000-0000000fc001'),
  ('00000000-0000-0000-0000-0000000fcd02', '00000000-0000-0000-0000-0000000fcaaa', 'Tarjeta Atom', 'credit_card', 'household', '00000000-0000-0000-0000-0000000fc001');

insert into finance.recurring_transactions (id, household_id, account_id, to_account_id, type, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000fce01', '00000000-0000-0000-0000-0000000fcaaa', '00000000-0000-0000-0000-0000000fcd01', '00000000-0000-0000-0000-0000000fcd02', 'transfer', null, 25000, 'Pago tarjeta Atom', 'monthly', current_date, true);

-- Setup for the mid-confirm-failure scenario below MUST happen as table owner (bypasses RLS by
-- design, same as every other fixture insert in this file) — `finance.accounts` grants no direct
-- INSERT to `authenticated` (the only reachable write path is the create_account() seam), so this
-- MUST be seeded before `set local role authenticated` below, not after.
insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id, archived_at)
values ('00000000-0000-0000-0000-0000000fcd03', '00000000-0000-0000-0000-0000000fcaaa', 'Tarjeta Archivada', 'credit_card', 'household', '00000000-0000-0000-0000-0000000fc001', now());

insert into finance.recurring_transactions (id, household_id, account_id, to_account_id, type, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000fce02', '00000000-0000-0000-0000-0000000fcaaa', '00000000-0000-0000-0000-0000000fcd01', '00000000-0000-0000-0000-0000000fcd03', 'transfer', null, 1000, 'Bad destination', 'monthly', current_date, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000fc001","role":"authenticated"}';

select lives_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000fce01'::uuid) $$,
  'confirming a type=transfer definition succeeds'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fcaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fce01'),
  2::bigint, 'confirming a transfer definition posts EXACTLY 2 rows'
);

select is(
  (select count(distinct transfer_group_id)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fcaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fce01'),
  1::bigint, 'both legs share exactly ONE transfer_group_id'
);

select is(
  (select sum(amount_cents)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fcaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fce01'),
  0::bigint, 'the pair sums to zero (opposite signs, same magnitude)'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fcaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fce01' and category_id is not null),
  0::bigint, 'neither leg carries a category_id'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fcaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fce01' and recurring_id = '00000000-0000-0000-0000-0000000fce01'),
  2::bigint, 'both legs carry recurring_id set to the definition id'
);

select is(
  (select next_due_date from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fce01'),
  (current_date + interval '1 month')::date, 'the cursor advanced by exactly one month after a successful transfer confirm'
);

-- Force a mid-confirm failure that would otherwise let the 2nd leg fail after the 1st committed
-- under a naive two-statement design. `to_account_id` carries a real FK to finance.accounts(id),
-- so a genuinely nonexistent uuid is rejected by the FK at recurring_transactions-INSERT time —
-- before confirm() is ever called — which would not exercise confirm()'s own failure path at all.
-- The realistic way a "2nd leg would fail" reaches confirm() is exactly what §2.3's tenancy guard
-- exists to catch: the destination account existed and was valid when the definition was created
-- (both accounts were seeded above, before switching role), then got archived before the
-- occurrence was confirmed. This reproduces that timeline and proves the SAME
-- whole-statement-rollback guarantee: any raise inside this definer — whether from the guard or
-- from a hypothetical INSERT-time constraint violation — aborts the entire implicit transaction,
-- so no leg is ever committed alone.
select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000fce02'::uuid) $$,
  '42501', null, 'confirming a transfer whose to_account_id is archived raises (tenancy guard fires before any INSERT, proving the mid-confirm-failure path leaves zero rows)'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fcaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fce02'),
  0::bigint, 'a mid-confirm failure leaves ZERO rows for that occurrence (no orphan leg)'
);

select is(
  (select next_due_date from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fce02'),
  current_date, 'a mid-confirm failure leaves the cursor UNADVANCED'
);

select * from finish();
rollback;
