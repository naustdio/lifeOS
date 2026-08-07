-- pgTAP — CC-009 tenancy. A to_account_id belonging to another household raises 42501 inside the
-- definer despite RLS bypass; same for account_id cross-household. Per design.md §2.3.
--
-- The recurring_transactions.to_account_id FK only requires the account to EXIST, not that it
-- belongs to the same household as the definition — so a cross-household to_account_id is a real,
-- storable state (created by direct manipulation here, standing in for any future write path that
-- might not re-validate household membership) that the DEFINER function must re-guard itself,
-- since RLS is bypassed inside a security definer.

begin;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000ff001', 'tenancy-a@example.com', '{"full_name":"Tenancy A"}'),
  ('00000000-0000-0000-0000-0000000ff002', 'tenancy-b@example.com', '{"full_name":"Tenancy B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000ffaaa', 'tenancy household A', '00000000-0000-0000-0000-0000000ff001', '00000000-0000-0000-0000-0000000ff001'),
  ('00000000-0000-0000-0000-0000000ffbbb', 'tenancy household B', '00000000-0000-0000-0000-0000000ff002', '00000000-0000-0000-0000-0000000ff002')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000ffaaa', '00000000-0000-0000-0000-0000000ff001', 'owner'),
  ('00000000-0000-0000-0000-0000000ffbbb', '00000000-0000-0000-0000-0000000ff002', 'owner')
on conflict do nothing;

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-0000000ffd01', '00000000-0000-0000-0000-0000000ffaaa', 'Efectivo A Tenancy', 'cash', 'household', '00000000-0000-0000-0000-0000000ff001'),
  ('00000000-0000-0000-0000-0000000ffd02', '00000000-0000-0000-0000-0000000ffbbb', 'Tarjeta B Tenancy', 'credit_card', 'household', '00000000-0000-0000-0000-0000000ff002'),
  ('00000000-0000-0000-0000-0000000ffd03', '00000000-0000-0000-0000-0000000ffbbb', 'Efectivo B Tenancy', 'cash', 'household', '00000000-0000-0000-0000-0000000ff002');

-- Definition owned by household A, but to_account_id points at household B's card — a
-- cross-household destination that the FK alone does not prevent.
insert into finance.recurring_transactions (id, household_id, account_id, to_account_id, type, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000ffe01', '00000000-0000-0000-0000-0000000ffaaa', '00000000-0000-0000-0000-0000000ffd01', '00000000-0000-0000-0000-0000000ffd02', 'transfer', null, 5000, 'Cross-household to_account_id', 'monthly', current_date, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000ff001","role":"authenticated"}';

select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000ffe01'::uuid) $$,
  '42501', null, 'a to_account_id belonging to another household raises 42501 despite RLS bypass inside the definer'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000ffaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000ffe01'),
  0::bigint, 'the cross-household attempt leaves zero rows'
);

reset role;
reset request.jwt.claims;

-- Definition row itself is cross-household on account_id: household_id says A, but account_id
-- points at household B's own account (again, only forceable by direct manipulation — no write
-- path can normally construct this, but the definer must not trust it).
insert into finance.recurring_transactions (id, household_id, account_id, to_account_id, type, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000ffe02', '00000000-0000-0000-0000-0000000ffaaa', '00000000-0000-0000-0000-0000000ffd03', '00000000-0000-0000-0000-0000000ffd02', 'transfer', null, 3000, 'Cross-household account_id', 'monthly', current_date, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000ff001","role":"authenticated"}';

select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000ffe02'::uuid) $$,
  '42501', null, 'an account_id belonging to another household also raises 42501'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000ffaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000ffe02'),
  0::bigint, 'the second cross-household attempt also leaves zero rows'
);

select * from finish();
rollback;
