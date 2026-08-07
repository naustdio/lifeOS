-- pgTAP — money invariants: balances, transfers, idempotency, account creation
-- (design.md §9 "Database — money" / "Database — account creation", tasks.md T-025)
-- Extended by finance-account-types-expansion: eight account types (adds `investment`/`loaned`),
-- the inverted `loaned` sign guard, investment/loaned detail exclusivity + defaults, and the
-- `update_investment_value()` seam.

begin;
select plan(50);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000005a', 'money-a@example.com', '{"full_name":"Money A"}'),
  ('00000000-0000-0000-0000-00000000005b', 'money-b@example.com', '{"full_name":"Money B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000005aa', 'personal', '00000000-0000-0000-0000-00000000005a', '00000000-0000-0000-0000-00000000005a')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000005aa', '00000000-0000-0000-0000-00000000005a', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-000000005c01', '00000000-0000-0000-0000-0000000005aa', 'Gastos', 'expense');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- create_account: eight types, class mapping, atomic detail rows. Each id is
-- captured via set_config immediately after ONE call — calling a volatile
-- function inside a WHERE clause would invoke it once per scanned row.
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Efectivo','cash') into v_id;
  perform set_config('lifeos.test.cash', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Cuenta','checking') into v_id;
  perform set_config('lifeos.test.checking', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Ahorro','savings') into v_id;
  perform set_config('lifeos.test.savings', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Tarjeta','credit_card') into v_id;
  perform set_config('lifeos.test.credit_card', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Prestamo','liability',0,'household',0,
    500000,1200,24,22000,'2026-01-01') into v_id;
  perform set_config('lifeos.test.liability', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Meta','savings_goal',0,'household',0,
    null,null,null,null,null, 100000, '2027-01-01') into v_id;
  perform set_config('lifeos.test.goal', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Acciones','investment',0,'household',0,
    null,null,null,null,null, null,null, 300000, 350000, '2026-06-01') into v_id;
  perform set_config('lifeos.test.investment', v_id::text, false);
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Prestado a Juan','loaned',5000,'household',0,
    null,null,null,null,null, null,null, null,null,null, 'Juan', 5000, 6, '2026-12-01') into v_id;
  perform set_config('lifeos.test.loaned', v_id::text, false);
end $$;

select is((select class from finance.accounts where id = current_setting('lifeos.test.cash')::uuid),
  'asset', 'cash account gets class=asset');
select is((select class from finance.accounts where id = current_setting('lifeos.test.checking')::uuid),
  'asset', 'checking account gets class=asset');
select is((select class from finance.accounts where id = current_setting('lifeos.test.savings')::uuid),
  'asset', 'savings account gets class=asset');
select is((select class from finance.accounts where id = current_setting('lifeos.test.credit_card')::uuid),
  'liability', 'credit_card account gets class=liability');
select is((select class from finance.accounts where id = current_setting('lifeos.test.liability')::uuid),
  'liability', 'liability account gets class=liability');
select is((select class from finance.accounts where id = current_setting('lifeos.test.goal')::uuid),
  'asset', 'savings_goal account gets class=asset');
select is((select class from finance.accounts where id = current_setting('lifeos.test.investment')::uuid),
  'asset', 'investment account gets class=asset');
select is((select class from finance.accounts where id = current_setting('lifeos.test.loaned')::uuid),
  'asset', 'loaned account gets class=asset');

-- investment/loaned detail rows exist atomically
select is(
  (select count(*) from finance.account_investment_details where account_id = current_setting('lifeos.test.investment')::uuid),
  1::bigint, 'investment account has exactly one detail row'
);
select is(
  (select count(*) from finance.account_loaned_details where account_id = current_setting('lifeos.test.loaned')::uuid),
  1::bigint, 'loaned account has exactly one detail row'
);

-- liability/goal detail rows exist atomically
select is(
  (select count(*) from finance.account_liability_details where account_id = current_setting('lifeos.test.liability')::uuid),
  1::bigint, 'liability account has exactly one detail row'
);
select is(
  (select count(*) from finance.account_goal_details where account_id = current_setting('lifeos.test.goal')::uuid),
  1::bigint, 'savings_goal account has exactly one detail row'
);

-- mismatched detail block rejected with 22023
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','Bad','liability',0,'household',0,
       null, 1200, 24, 22000, '2026-01-01') $$,
  '22023', null, 'liability missing original_amount_cents is rejected with 22023'
);
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','Bad2','cash',0,'household',0,
       500000, 1200, 24, 22000, '2026-01-01') $$,
  '22023', null, 'detail fields on a plain cash account are rejected with 22023'
);

-- positive opening balance on debt-bearing types rejected
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadCC','credit_card',100) $$,
  '22023', null, 'credit_card with positive opening_balance_cents is rejected with 22023'
);
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadLoan','liability',100,'household',0,
       500000,1200,24,22000,'2026-01-01') $$,
  '22023', null, 'liability with positive opening_balance_cents is rejected with 22023'
);

-- investment/loaned detail exclusivity
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadInv','investment') $$,
  '22023', null, 'investment without a cost basis is rejected with 22023'
);
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadLoaned','loaned',0,'household',0,
       null,null,null,null,null, null,null, null,null,null, null, 5000, null, null) $$,
  '22023', null, 'loaned without a counterparty name is rejected with 22023'
);
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadLoaned2','loaned',0,'household',0,
       null,null,null,null,null, null,null, null,null,null, '   ', 5000, null, null) $$,
  '22023', null, 'loaned with a blank (whitespace-only) counterparty name is rejected with 22023'
);
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadInvLoan','investment',0,'household',0,
       null,null,null,null,null, null,null, 300000,null,null, 'Juan',5000,null,null) $$,
  '22023', null, 'investment carrying a loaned detail block is rejected with 22023'
);

-- THE named regression (design.md Decision 1): loaned's sign guard is a SEPARATE, INVERTED
-- statement — it must never be folded into the liability guard's `in (...)` list, or household
-- net worth silently inverts.
select lives_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','GoodLoanedZero','loaned',0,'household',0,
       null,null,null,null,null, null,null, null,null,null, 'Ana',1000,null,null) $$,
  'loaned with a zero opening balance is accepted'
);
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadLoanedSign','loaned',-100,'household',0,
       null,null,null,null,null, null,null, null,null,null, 'Ana',1000,null,null) $$,
  '22023', null, 'loaned with a NEGATIVE opening balance is rejected with 22023 (inverse of the liability guard)'
);

-- investment defaults: current_value_cents defaults to cost_basis_cents, valued_on defaults to
-- current_date, when the caller omits them — rendimiento reads 0, never NULL.
do $$
declare v_id uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','SinValorar','investment',0,'household',0,
    null,null,null,null,null, null,null, 400000,null,null) into v_id;
  perform set_config('lifeos.test.investment_defaulted', v_id::text, false);
end $$;
select is(
  (select current_value_cents from finance.account_investment_details
    where account_id = current_setting('lifeos.test.investment_defaulted')::uuid),
  400000::bigint, 'investment created without current_value defaults current_value_cents to cost_basis_cents'
);
select is(
  (select valued_on from finance.account_investment_details
    where account_id = current_setting('lifeos.test.investment_defaulted')::uuid),
  current_date, 'investment created without valued_on defaults to current_date'
);

-- a failing detail CHECK rolls the account row back too (no orphan account)
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadTerm','liability',0,'household',0,
       500000,1200,0,22000,'2026-01-01') $$,
  '23514', null, 'liability with term_months <= 0 fails its CHECK'
);
select is(
  (select count(*) from finance.accounts where name = 'BadTerm'), 0::bigint,
  'no orphan account row survives a rolled-back detail insert'
);

-- non-member raises 42501
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005b","role":"authenticated"}';
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','Intruder','cash') $$,
  '42501', null, 'a non-member calling create_account raises 42501'
);

-- owner_user_id is always the caller
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}';

do $$
declare v_id uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Yo','cash') into v_id;
  perform set_config('lifeos.test.self', v_id::text, false);
end $$;

select is(
  (select owner_user_id from finance.accounts where id = current_setting('lifeos.test.self')::uuid),
  '00000000-0000-0000-0000-00000000005a'::uuid, 'owner_user_id on the created row is the caller'
);

-- ---------------------------------------------------------------------------
-- Balances, voids, transfers
-- ---------------------------------------------------------------------------
do $$
declare v_src uuid; v_dst uuid; v_tx uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Src','checking',100000) into v_src;
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Dst','checking',0) into v_dst;

  select finance.record_transaction('00000000-0000-0000-0000-0000000005aa', v_src,
    '00000000-0000-0000-0000-000000005c01', 'expense', 2000, current_date) into v_tx;

  perform set_config('lifeos.test.src', v_src::text, false);
  perform set_config('lifeos.test.dst', v_dst::text, false);
  perform set_config('lifeos.test.tx', v_tx::text, false);
end $$;

select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.src')::uuid),
  98000::bigint, 'balance reflects opening_balance minus the posted expense'
);

select lives_ok(
  $$ select finance.void_transaction(current_setting('lifeos.test.tx')::uuid, 'test void') $$,
  'voiding the expense succeeds'
);

select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.src')::uuid),
  100000::bigint, 'balance excludes a voided transaction (back to opening balance)'
);

-- transfer: sum-zero invariant + both balances move
do $$
declare v_group uuid;
begin
  select finance.record_transfer('00000000-0000-0000-0000-0000000005aa',
    current_setting('lifeos.test.src')::uuid, current_setting('lifeos.test.dst')::uuid,
    5000, current_date) into v_group;
  perform set_config('lifeos.test.group', v_group::text, false);
end $$;

select is(
  (select sum(amount_cents)::bigint from finance.transactions where transfer_group_id = current_setting('lifeos.test.group')::uuid),
  0::bigint, 'transfer pair sums to zero'
);
select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.src')::uuid),
  95000::bigint, 'transfer source balance decreased'
);
select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.dst')::uuid),
  5000::bigint, 'transfer destination balance increased'
);

-- transfer-leg-immovable: moving a transfer leg to another account is rejected 22023
do $$
declare v_other uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Other','checking',0) into v_other;
  perform set_config('lifeos.test.other', v_other::text, false);
end $$;

select throws_ok(
  $$ select finance.update_transaction(
       (select id from finance.transactions where transfer_group_id = current_setting('lifeos.test.group')::uuid limit 1),
       current_setting('lifeos.test.other')::uuid) $$,
  '22023', null, 'moving a transfer leg to another account is rejected with 22023 (TRANSFER_LEG_NOT_MOVABLE)'
);

-- idempotency: replaying record_transaction with the same key returns the same row
do $$
declare v_first uuid; v_second uuid; v_acct uuid;
begin
  select finance.create_account('00000000-0000-0000-0000-0000000005aa','Idem','cash',0) into v_acct;
  select finance.record_transaction('00000000-0000-0000-0000-0000000005aa', v_acct,
    '00000000-0000-0000-0000-000000005c01', 'expense', 1000, current_date, 'x', 'shopping_list', 'sl-1', 'key-1') into v_first;
  select finance.record_transaction('00000000-0000-0000-0000-0000000005aa', v_acct,
    '00000000-0000-0000-0000-000000005c01', 'expense', 1000, current_date, 'x', 'shopping_list', 'sl-1', 'key-1') into v_second;
  perform set_config('lifeos.test.idem1', v_first::text, false);
  perform set_config('lifeos.test.idem2', v_second::text, false);
end $$;

select is(
  current_setting('lifeos.test.idem1'), current_setting('lifeos.test.idem2'),
  'replaying record_transaction with the same idempotency key returns the same row'
);
select is(
  (select count(*) from finance.transactions where origin_module = 'shopping_list' and origin_entity_id = 'sl-1'),
  1::bigint, 'exactly one row exists after the replay'
);

-- available_cents excludes credit_card/liability: put real debt on the credit_card account
-- and confirm household_summary counts it as debt_cents, never inside available_cents.
do $$
begin
  perform finance.record_transaction('00000000-0000-0000-0000-0000000005aa',
    current_setting('lifeos.test.credit_card')::uuid,
    '00000000-0000-0000-0000-000000005c01', 'expense', 3000, current_date);
end $$;

select is(
  (select debt_cents::bigint from finance.household_summary where household_id = '00000000-0000-0000-0000-0000000005aa'),
  3000::bigint, 'debt_cents reflects the credit_card balance as a positive magnitude'
);
select is(
  (select balance_cents::bigint from finance.account_balances where account_id = current_setting('lifeos.test.credit_card')::uuid) < 0,
  true, 'the credit_card account balance itself is negative (debt)'
);

-- ---------------------------------------------------------------------------
-- update_investment_value() — the new seam (design.md §1.5). Display-only: it must write ZERO
-- transactions, must reject a non-investment account, a foreign-household account, and a
-- non-member caller.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select finance.update_investment_value('00000000-0000-0000-0000-0000000005aa',
       current_setting('lifeos.test.investment')::uuid, 360000, '2026-07-01') $$,
  'update_investment_value succeeds for the owning household on an investment account'
);
select is(
  (select current_value_cents from finance.account_investment_details
    where account_id = current_setting('lifeos.test.investment')::uuid),
  360000::bigint, 'update_investment_value updates current_value_cents'
);
select is(
  (select valued_on from finance.account_investment_details
    where account_id = current_setting('lifeos.test.investment')::uuid),
  '2026-07-01'::date, 'update_investment_value updates valued_on'
);
select is(
  (select count(*) from finance.transactions where account_id = current_setting('lifeos.test.investment')::uuid),
  0::bigint, 'update_investment_value writes zero transactions (an unrealized valuation is not income)'
);
select throws_ok(
  $$ select finance.update_investment_value('00000000-0000-0000-0000-0000000005aa',
       current_setting('lifeos.test.liability')::uuid, 100) $$,
  '22023', null, 'update_investment_value rejects a non-investment account'
);

-- member A also belongs to a second household ("05bb"), but the investment account itself
-- lives under "05aa" — this proves the seam checks the account's OWN household_id, not merely
-- that the caller is a member of *some* household.
reset role; reset request.jwt.claims;
do $$
declare v_other_household uuid := '00000000-0000-0000-0000-0000000005bb';
begin
  insert into core.households (id, name, personal_owner_user_id, created_by)
  values (v_other_household, 'other household', null, '00000000-0000-0000-0000-00000000005a')
  on conflict (id) do nothing;
  insert into core.household_members (household_id, user_id, role)
  values (v_other_household, '00000000-0000-0000-0000-00000000005a', 'owner')
  on conflict do nothing;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}';
select throws_ok(
  $$ select finance.update_investment_value('00000000-0000-0000-0000-0000000005bb',
       current_setting('lifeos.test.investment')::uuid, 100) $$,
  '22023', null, 'update_investment_value rejects an investment account outside the given household'
);

reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005b","role":"authenticated"}';
select throws_ok(
  $$ select finance.update_investment_value('00000000-0000-0000-0000-0000000005aa',
       current_setting('lifeos.test.investment')::uuid, 100) $$,
  '42501', null, 'update_investment_value rejects a non-member caller'
);
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}';

-- CHECK domain: widening the type list to eight literals does not open the domain — an
-- unrecognized type is still rejected. In practice `derive_account_class()`'s BEFORE INSERT
-- trigger runs before the CHECK constraint is evaluated, so its catch-all `raise` (22023) is
-- what actually fires — proving the two-layer defense (trigger catch-all + CHECK) both still
-- treat an unknown type as rejected, never silently accepted.
select throws_ok(
  $$ select finance.create_account('00000000-0000-0000-0000-0000000005aa','BadCrypto','crypto') $$,
  '22023', null, 'type = crypto is still rejected (trigger catch-all fires before the widened CHECK)'
);

-- ---------------------------------------------------------------------------
-- Non-MXN currency CHECK constraint (design.md §3.2/§3.3, finance-accounts spec scenario;
-- verify-report-2a new finding — this constraint had no dedicated pgTAP assertion).
-- Reverts to member A's session; direct INSERT bypasses the seam deliberately here because the
-- goal is exercising the raw DDL CHECK, not the seam's own validation.
-- ---------------------------------------------------------------------------
reset role; reset request.jwt.claims;
select throws_ok(
  $$ insert into finance.accounts (household_id, name, type, visibility, owner_user_id, currency)
     values ('00000000-0000-0000-0000-0000000005aa', 'USD Account', 'cash', 'household',
             '00000000-0000-0000-0000-00000000005a', 'USD') $$,
  '23514', null, 'a non-MXN currency on finance.accounts is rejected by the currency CHECK constraint'
);
select throws_ok(
  $$ insert into finance.transactions (household_id, account_id, category_id, type, amount_cents,
       occurred_on, created_by_user_id, currency)
     values ('00000000-0000-0000-0000-0000000005aa', current_setting('lifeos.test.src')::uuid,
       '00000000-0000-0000-0000-000000005c01', 'expense', -100, current_date,
       '00000000-0000-0000-0000-00000000005a', 'USD') $$,
  '23514', null, 'a non-MXN currency on finance.transactions is rejected by the currency CHECK constraint'
);

-- security_invoker regression: a non-member sees zero rows from the view
reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000005b","role":"authenticated"}';
select is(
  (select count(*) from finance.account_balances where household_id = '00000000-0000-0000-0000-0000000005aa'),
  0::bigint, 'account_balances view honors RLS (security_invoker regression) — non-member sees zero rows'
);

select * from finish();
rollback;
