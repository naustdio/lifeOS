-- pgTAP — correction-path rejections not covered by 040_finance_money.sql's
-- transfer-leg-immovable case (design.md §5.4, tasks.md T-034).
--
-- Cases: (a) moving a transaction to an account in a DIFFERENT household is rejected 42501
-- (INVALID_DESTINATION_ACCOUNT), confirming the exact errcode/behavior finance.update_transaction
-- produces; (b) editing a transaction whose status is already 'void' is rejected 22023, not
-- silently allowed to "resurrect" a voided entry.

begin;
select plan(4);

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
