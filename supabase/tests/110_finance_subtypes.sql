-- pgTAP — Finance Transactions Sub-types (change: finance-transaction-subtypes, tasks.md T-002).
--
-- Cases: (1) CHECK whitelist — invalid value rejected, all 5 accepted at column level, null
-- accepted; (2) pairing guard on all three write RPCs, including compra_meses's reservation
-- (Decision 6); (3) backward compat — old argument-count calls still succeed with subtype=null
-- (the regression test for the DROP+CREATE overload hazard, design.md §1a); (4) transfer pair
-- symmetry; (5) update_transaction semantics (unchanged/clear/mismatch/void-lock); (6) the
-- origin path still resolves post drop/re-create.

begin;
select plan(26);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000ba0a', 'subtypes-a@example.com', '{"full_name":"Subtypes A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000ba0aa', 'personal', '00000000-0000-0000-0000-00000000ba0a', '00000000-0000-0000-0000-00000000ba0a')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000ba0aa', '00000000-0000-0000-0000-00000000ba0a', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values
  ('00000000-0000-0000-0000-000000ba0c01', '00000000-0000-0000-0000-0000000ba0aa', 'Gastos', 'expense'),
  ('00000000-0000-0000-0000-000000ba0c02', '00000000-0000-0000-0000-0000000ba0aa', 'Ingresos', 'income')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000ba0a","role":"authenticated"}';

do $$
declare v_acct uuid; v_acct2 uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000ba0aa', 'Subtypes Checking', 'checking', 50000) into v_acct;
  select finance.create_account('00000000-0000-0000-0000-0000000ba0aa', 'Subtypes Card', 'credit_card', 0) into v_acct2;
  perform set_config('lifeos.test.acct', v_acct::text, false);
  perform set_config('lifeos.test.acct2', v_acct2::text, false);
end $$;

-- ---------------------------------------------------------------------------
-- (1) CHECK whitelist. Direct INSERT bypasses the seam deliberately here (same precedent as
-- 040_finance_money.sql's currency CHECK cases): the goal is exercising the raw DDL CHECK, not
-- the seam's own validation, and DML on finance.transactions is revoked from `authenticated`
-- (finance_security.sql), so this one case reverts to the table-owner role first.
-- ---------------------------------------------------------------------------
reset role; reset request.jwt.claims;
select throws_ok(
  $$ insert into finance.transactions
       (household_id, account_id, category_id, type, amount_cents, occurred_on, created_by_user_id, subtype)
     values ('00000000-0000-0000-0000-0000000ba0aa'::uuid, current_setting('lifeos.test.acct')::uuid,
             '00000000-0000-0000-0000-000000ba0c01'::uuid, 'expense', -100, current_date,
             '00000000-0000-0000-0000-00000000ba0a'::uuid, 'not-a-real-subtype') $$,
  '23514', null,
  'subtype = not-real fails the CHECK constraint'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000ba0a","role":"authenticated"}';

select lives_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c01', 'expense', 100, current_date, '', 'manual', null, null, 'pago') $$,
  'pago on expense passes the CHECK and the pairing guard'
);
select lives_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c02', 'income', 100, current_date, '', 'manual', null, null, 'reembolso') $$,
  'reembolso on income passes the CHECK and the pairing guard'
);
select lives_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c02', 'income', 100, current_date, '', 'manual', null, null, 'devolucion_efectivo') $$,
  'devolucion_efectivo on income passes the CHECK and the pairing guard'
);
select lives_ok(
  $$ select finance.record_transfer('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       current_setting('lifeos.test.acct2')::uuid, 100, current_date, '', 'manual', null, null, 'pago_tarjeta') $$,
  'pago_tarjeta on transfer passes the CHECK and the pairing guard'
);
select lives_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c01', 'expense', 100, current_date, '', 'manual', null, null, null) $$,
  'null subtype is accepted at column level'
);

-- ---------------------------------------------------------------------------
-- (2) pairing guard rejections, including compra_meses's reservation (Decision 6)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c02', 'income', 100, current_date, '', 'manual', null, null, 'pago') $$,
  '22023', null,
  'pago on income is rejected (pago is expense-only)'
);
select throws_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c01', 'expense', 100, current_date, '', 'manual', null, null, 'reembolso') $$,
  '22023', null,
  'reembolso on expense is rejected (reembolso is income-only)'
);
select throws_ok(
  $$ select finance.record_transfer('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       current_setting('lifeos.test.acct2')::uuid, 100, current_date, '', 'manual', null, null, 'pago') $$,
  '22023', null,
  'pago on a transfer is rejected'
);
select throws_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       '00000000-0000-0000-0000-000000ba0c01', 'expense', 100, current_date, '', 'manual', null, null, 'compra_meses') $$,
  '22023', null,
  'compra_meses is rejected on record_transaction (reserved, unreachable)'
);
select throws_ok(
  $$ select finance.record_transfer('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
       current_setting('lifeos.test.acct2')::uuid, 100, current_date, '', 'manual', null, null, 'compra_meses') $$,
  '22023', null,
  'compra_meses is rejected on record_transfer (reserved, unreachable)'
);

-- ---------------------------------------------------------------------------
-- (3) backward compatibility — old argument-count calls still succeed with subtype = null
-- (the regression test for the DROP+CREATE overload hazard, design.md §1a Decision 2)
-- ---------------------------------------------------------------------------
do $$
declare v_old_tx uuid; v_old_transfer uuid;
begin
  select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    '00000000-0000-0000-0000-000000ba0c01', 'expense', 250, current_date) into v_old_tx;
  perform set_config('lifeos.test.old_tx', v_old_tx::text, false);

  select finance.record_transfer('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    current_setting('lifeos.test.acct2')::uuid, 250, current_date) into v_old_transfer;
  perform set_config('lifeos.test.old_transfer', v_old_transfer::text, false);
end $$;

select is(
  (select subtype from finance.transactions where id = current_setting('lifeos.test.old_tx')::uuid),
  null,
  'record_transaction called with the pre-change 10-arg signature succeeds and stores subtype = null'
);
select is(
  (select count(*)::int from finance.transactions
    where transfer_group_id = current_setting('lifeos.test.old_transfer')::uuid and subtype is null),
  2,
  'record_transfer called with the pre-change 9-arg signature succeeds and stores subtype = null on both legs'
);

do $$
declare v_old_edit_tx uuid;
begin
  select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    '00000000-0000-0000-0000-000000ba0c01', 'expense', 300, current_date) into v_old_edit_tx;
  perform set_config('lifeos.test.old_edit_tx', v_old_edit_tx::text, false);
  perform finance.update_transaction(v_old_edit_tx, null, null, 350, null, 'legacy 6-arg call');
end $$;

select is(
  (select description from finance.transactions where id = current_setting('lifeos.test.old_edit_tx')::uuid),
  'legacy 6-arg call',
  'update_transaction called with the pre-change 6-arg signature still resolves and applies the patch'
);

-- ---------------------------------------------------------------------------
-- (4) transfer pair symmetry — both legs share subtype; idempotent replay does not alter it
-- ---------------------------------------------------------------------------
do $$
declare v_group uuid; v_replay uuid;
begin
  select finance.record_transfer('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    current_setting('lifeos.test.acct2')::uuid, 777, current_date, 'pair test', 'manual', 'origin-1', 'idem-pair-1', 'pago_tarjeta') into v_group;
  perform set_config('lifeos.test.pair_group', v_group::text, false);

  -- idempotent replay: same origin + idempotency key
  select finance.record_transfer('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    current_setting('lifeos.test.acct2')::uuid, 777, current_date, 'pair test', 'manual', 'origin-1', 'idem-pair-1', 'pago_tarjeta') into v_replay;
  perform set_config('lifeos.test.pair_replay', v_replay::text, false);
end $$;

select is(
  (select count(distinct subtype)::int from finance.transactions where transfer_group_id = current_setting('lifeos.test.pair_group')::uuid),
  1,
  'both legs of a pago_tarjeta transfer share the same subtype'
);
select is(
  (select count(*)::int from finance.transactions where transfer_group_id = current_setting('lifeos.test.pair_group')::uuid),
  2,
  'the idempotent replay did not insert a third leg'
);
select is(
  current_setting('lifeos.test.pair_replay'),
  current_setting('lifeos.test.pair_group'),
  'the idempotent replay returns the already-committed group id'
);

-- ---------------------------------------------------------------------------
-- (5) update_transaction semantics
-- ---------------------------------------------------------------------------
do $$
declare v_edit_tx uuid;
begin
  select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    '00000000-0000-0000-0000-000000ba0c01', 'expense', 400, current_date, '', 'manual', null, null, 'pago') into v_edit_tx;
  perform set_config('lifeos.test.edit_tx', v_edit_tx::text, false);
end $$;

select lives_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.edit_tx')::uuid, null, null, null, null, null, null, false) $$,
  'omitting p_subtype (null, clear=false) succeeds'
);
select is(
  (select subtype from finance.transactions where id = current_setting('lifeos.test.edit_tx')::uuid),
  'pago',
  'p_subtype => null, p_clear_subtype => false leaves the existing subtype unchanged'
);

select lives_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.edit_tx')::uuid, null, null, null, null, null, null, true) $$,
  'p_clear_subtype => true succeeds'
);
select is(
  (select subtype from finance.transactions where id = current_setting('lifeos.test.edit_tx')::uuid),
  null,
  'p_clear_subtype => true clears the subtype to null'
);

select throws_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.edit_tx')::uuid, null, null, null, null, null, 'reembolso', false) $$,
  '22023', null,
  'a mismatched p_subtype (reembolso on an expense) is rejected'
);

do $$
begin
  perform finance.void_transaction(current_setting('lifeos.test.edit_tx')::uuid, 'void for subtype edit-lock check');
end $$;

select throws_ok(
  $$ select finance.update_transaction(current_setting('lifeos.test.edit_tx')::uuid, null, null, null, null, null, 'pago', false) $$,
  '22023', null,
  'a voided row still rejects the subtype edit (void-lock runs before the pairing guard)'
);

-- ---------------------------------------------------------------------------
-- (6) origin path still resolves post drop/re-create
-- ---------------------------------------------------------------------------
do $$
declare v_origin_tx uuid;
begin
  select finance.record_transaction('00000000-0000-0000-0000-0000000ba0aa', current_setting('lifeos.test.acct')::uuid,
    '00000000-0000-0000-0000-000000ba0c01', 'expense', 500, current_date, '', 'car_control', 'origin-entity-1', 'idem-origin-1') into v_origin_tx;
  perform set_config('lifeos.test.origin_tx', v_origin_tx::text, false);
end $$;

select lives_ok(
  $$ select finance.update_origin_transaction('00000000-0000-0000-0000-0000000ba0aa', 'car_control', 'origin-entity-1', null, null, 600) $$,
  'update_origin_transaction still resolves and patches post drop/re-create'
);
select is(
  (select amount_cents::bigint from finance.transactions where id = current_setting('lifeos.test.origin_tx')::uuid),
  -600::bigint,
  'the origin-addressed patch applied the new amount'
);

select is(
  (select conname from pg_constraint where conname = 'transactions_subtype_whitelist'),
  'transactions_subtype_whitelist',
  'the transactions_subtype_whitelist CHECK constraint exists'
);

select * from finish();
rollback;
