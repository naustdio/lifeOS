-- pgTAP — correction-path cases not covered by 040_finance_money.sql's transfer-leg-immovable
-- case (design.md §5.4, tasks.md T-034).
--
-- Cases: (0) moving a transaction between two accounts in the SAME household leaves BOTH
-- balances correct (design.md §5.4's "balance correctness is free" claim — verified true, not
-- just architecturally plausible); (a) moving a transaction to an account in a DIFFERENT
-- household is rejected 42501 (INVALID_DESTINATION_ACCOUNT), confirming the exact
-- errcode/behavior finance.update_transaction produces; (b) editing a transaction whose status
-- is already 'void' is rejected 22023, not silently allowed to "resurrect" a voided entry.

begin;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000008a', 'corr-a@example.com', '{"full_name":"Corr A"}'),
  ('00000000-0000-0000-0000-00000000008b', 'corr-b@example.com', '{"full_name":"Corr B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000008aa', 'personal', '00000000-0000-0000-0000-00000000008a', '00000000-0000-0000-0000-00000000008a'),
  ('00000000-0000-0000-0000-0000000008bb', 'personal', '00000000-0000-0000-0000-00000000008b', '00000000-0000-0000-0000-00000000008b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000008aa', '00000000-0000-0000-0000-00000000008a', 'owner'),
  ('00000000-0000-0000-0000-0000000008bb', '00000000-0000-0000-0000-00000000008b', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-000000008c01', '00000000-0000-0000-0000-0000000008aa', 'Gastos', 'expense');

-- Household B's account, seeded directly as table owner (RLS-bypassing fixture setup, same
-- pattern as 030_finance_rls.sql) so it exists cross-tenant without requiring B's session or
-- INSERT grants that the `authenticated` role deliberately does not have.
insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-000000008b01', '00000000-0000-0000-0000-0000000008bb', 'B Checking', 'checking', 'household', '00000000-0000-0000-0000-00000000008b')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000008a","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- (0) same-household account move: both balances are correct afterward, not just
-- architecturally plausible.
-- ---------------------------------------------------------------------------
do $$
declare v_from uuid; v_to uuid; v_move_tx uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000008aa', 'Move From', 'checking', 30000) into v_from;
  select finance.create_account('00000000-0000-0000-0000-0000000008aa', 'Move To', 'checking', 5000) into v_to;
  select finance.record_transaction('00000000-0000-0000-0000-0000000008aa', v_from,
    '00000000-0000-0000-0000-000000008c01', 'expense', 4000, current_date) into v_move_tx;
  perform set_config('lifeos.test.move_from', v_from::text, false);
  perform set_config('lifeos.test.move_to', v_to::text, false);
  perform set_config('lifeos.test.move_tx', v_move_tx::text, false);
end $$;

select lives_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.move_tx')::uuid,
       current_setting('lifeos.test.move_to')::uuid) $$,
  'moving a transaction between two same-household accounts succeeds'
);

select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.move_from')::uuid),
  30000::bigint,
  'the source account balance is restored to opening balance after the expense moves away'
);
select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.move_to')::uuid),
  1000::bigint,
  'the destination account balance reflects the moved expense (5000 opening - 4000 moved-in expense)'
);

-- ---------------------------------------------------------------------------
-- (a) cross-space account-move rejection: destination account belongs to household B, caller
-- and the transaction both belong to household A.
-- ---------------------------------------------------------------------------
do $$
declare v_acct_a uuid; v_acct_b uuid; v_tx uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000008aa', 'A Checking', 'checking', 50000) into v_acct_a;
  perform set_config('lifeos.test.acct_a', v_acct_a::text, false);

  select finance.record_transaction('00000000-0000-0000-0000-0000000008aa', v_acct_a,
    '00000000-0000-0000-0000-000000008c01', 'expense', 1500, current_date) into v_tx;
  perform set_config('lifeos.test.tx', v_tx::text, false);
end $$;

select throws_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.tx')::uuid,
       '00000000-0000-0000-0000-000000008b01'::uuid) $$,
  '42501', null,
  'moving a transaction to an account in a different household is rejected with 42501 (INVALID_DESTINATION_ACCOUNT)'
);

select is(
  (select household_id from finance.transactions where id = current_setting('lifeos.test.tx')::uuid),
  '00000000-0000-0000-0000-0000000008aa'::uuid,
  'the rejected cross-space move left the transaction''s household unchanged'
);

-- ---------------------------------------------------------------------------
-- (b) editing a voided transaction is rejected — it must not "resurrect" the voided entry.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select finance.void_transaction(current_setting('lifeos.test.tx')::uuid, 'test void for edit-lock check') $$,
  'voiding the transaction succeeds (setup for the edit-voided case)'
);

select throws_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.tx')::uuid, null, null, 2000) $$,
  '22023', null,
  'editing a voided transaction is rejected with 22023, not silently applied'
);

select * from finish();
rollback;
