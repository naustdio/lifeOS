-- pgTAP — expense-branch regression guard (design.md §2.2 Decision 5, tasks.md CC-003/CC-005).
--
-- This is the single most important test file in Slice A. It asserts a byte-for-byte-unchanged
-- property of confirm_recurring_transaction()'s EXPENSE branch across the transfer-branch
-- rewrite: the idempotency key MUST stay the bare, unsuffixed `v_due::text` — never
-- `<due>:out`/`<due>:in`. Suffixing it would make every already-posted historical expense
-- occurrence non-conflicting on replay, i.e. it would silently re-post every recurring expense
-- ever confirmed in production. This file is run TWICE by design:
--
--   1. CC-003 [RED baseline]: run against the PRE-CHANGE function (before
--      20260804090022_finance_recurring_transfer_api.sql lands) — captured as a passing baseline
--      proving today's behavior.
--   2. CC-005 [GREEN regression proof]: re-run UNCHANGED against the POST-CHANGE function — must
--      still pass byte-identically, PLUS the explicit no-suffix assertion at the bottom.

begin;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000fb001', 'expreg-a@example.com', '{"full_name":"ExpReg A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000fbaaa', 'expreg household', '00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000000fb001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000fbaaa', '00000000-0000-0000-0000-0000000fb001', 'owner')
on conflict do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-0000000fbc01', '00000000-0000-0000-0000-0000000fbaaa', 'ExpReg Cat', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values ('00000000-0000-0000-0000-0000000fbd01', '00000000-0000-0000-0000-0000000fbaaa', 'Efectivo ExpReg', 'cash', 'household', '00000000-0000-0000-0000-0000000fb001');

insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000fbe01', '00000000-0000-0000-0000-0000000fbaaa', '00000000-0000-0000-0000-0000000fbd01', '00000000-0000-0000-0000-0000000fbc01', 9900, 'ExpReg Renta', 'monthly', current_date, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000fb001","role":"authenticated"}';

select lives_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000fbe01'::uuid) $$,
  'confirming an existing type=expense definition succeeds'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fbaaa'
      and origin_module = 'recurring' and origin_entity_id = '00000000-0000-0000-0000-0000000fbe01'),
  1::bigint, 'exactly ONE row is posted for a confirmed expense occurrence'
);

select is(
  (select category_id from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fbaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fbe01'),
  '00000000-0000-0000-0000-0000000fbc01', 'posted row carries the definition''s category_id'
);

select is(
  (select next_due_date from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fbe01'),
  (current_date + interval '1 month')::date, 'the cursor advances by exactly one month'
);

-- The NAMED regression: the key MUST be the bare due date, unsuffixed. `:out`/`:in` suffixes are
-- a transfer-branch-only concept (new in this migration) and MUST NEVER appear on an expense row.
select is(
  (select idempotency_key from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fbaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fbe01'),
  current_date::text,
  'idempotency_key is the BARE due date (current_date::text), byte-for-byte, no :out/:in suffix'
);

select ok(
  (select idempotency_key from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fbaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fbe01')
    not like '%:out' and
  (select idempotency_key from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fbaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fbe01')
    not like '%:in',
  'explicit negative assertion: the expense key contains neither the :out nor the :in suffix'
);

select * from finish();
rollback;
