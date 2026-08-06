-- pgTAP — finance.recurring_transactions / finance.recurring_due / the confirm+discard seam
-- (design.md §11, change: finance-recurring R-004).
--
-- Covers: tenancy (member/non-member/anon on the table and the view); the named
-- security_invoker regression; idempotency (two confirms for the same due date yield one
-- transaction and the cursor advances exactly once); the row-lock/ordering guarantee (two
-- sequential confirms never advance the cursor twice); confirm/discard atomicity and row shape;
-- confirm error paths leave zero transactions and an unchanged cursor; pause/resume/delete; and
-- the widened origin_module domain.

begin;
select plan(33);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000009a', 'recur-a@example.com', '{"full_name":"Recur A"}'),
  ('00000000-0000-0000-0000-00000000009b', 'recur-b@example.com', '{"full_name":"Recur B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000009aa', 'personal', '00000000-0000-0000-0000-00000000009a', '00000000-0000-0000-0000-00000000009a'),
  ('00000000-0000-0000-0000-0000000009bb', 'personal', '00000000-0000-0000-0000-00000000009b', '00000000-0000-0000-0000-00000000009b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-00000000009a', 'owner'),
  ('00000000-0000-0000-0000-0000000009bb', '00000000-0000-0000-0000-00000000009b', 'owner')
on conflict do nothing;

-- Fixture setup as table owner (bypasses RLS by design — this is the setup role, not the
-- impersonated role under test).
insert into finance.categories (id, household_id, name, kind)
values
  ('00000000-0000-0000-0000-000000009c01', '00000000-0000-0000-0000-0000000009aa', 'Renta Test', 'expense'),
  ('00000000-0000-0000-0000-000000009c02', '00000000-0000-0000-0000-0000000009bb', 'Renta B Test', 'expense');

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-0000000009aa', 'Efectivo A', 'cash', 'household', '00000000-0000-0000-0000-00000000009a'),
  ('00000000-0000-0000-0000-000000009d02', '00000000-0000-0000-0000-0000000009bb', 'Efectivo B', 'cash', 'household', '00000000-0000-0000-0000-00000000009b');

-- Definition A: due today (overdue by 0 days) — the main fixture for confirm/discard/idempotency.
insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-000000009e01', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 12000, 'Renta', 'monthly', current_date, true);

-- Definition B: household B's own due definition, used for the security_invoker regression.
insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-000000009e02', '00000000-0000-0000-0000-0000000009bb', '00000000-0000-0000-0000-000000009d02', '00000000-0000-0000-0000-000000009c02', 5000, 'Renta B', 'monthly', current_date - 3, true);

-- ---------------------------------------------------------------------------
-- Tenancy (design.md §5, §11)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000009a","role":"authenticated"}';

select is(
  (select count(*)::bigint from finance.recurring_transactions where household_id = '00000000-0000-0000-0000-0000000009aa'),
  1::bigint, 'member A sees household A''s recurring definition'
);

select is(
  (select count(*)::bigint from finance.recurring_transactions where household_id = '00000000-0000-0000-0000-0000000009bb'),
  0::bigint, 'non-member A sees zero recurring definitions from household B'
);

select is(
  (select count(*)::bigint from finance.recurring_due where household_id = '00000000-0000-0000-0000-0000000009aa'),
  1::bigint, 'member A sees household A''s own due item through recurring_due'
);

-- CRITICAL, NAMED REGRESSION: without `security_invoker = true` on finance.recurring_due, this
-- would run as the view's owner and leak household B's due row to a non-member session. Household
-- B DOES have a due item (seeded above with next_due_date = current_date - 3), so a non-zero
-- result here would prove an RLS bypass, not just an empty-fixture false negative.
select is(
  (select count(*)::bigint from finance.recurring_due where household_id = '00000000-0000-0000-0000-0000000009bb'),
  0::bigint, 'security_invoker regression: non-member session reading recurring_due for another space returns zero rows despite due items existing'
);

-- ---------------------------------------------------------------------------
-- Idempotency + row-lock ordering (design.md §4, §10 Decision 2/3)
-- ---------------------------------------------------------------------------
select is(
  (select next_due_date from finance.recurring_transactions where id = '00000000-0000-0000-0000-000000009e01'),
  current_date, 'sanity: definition A cursor starts at today before any confirm'
);

select lives_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000009e01'::uuid) $$,
  'first confirm succeeds'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa'
      and origin_module = 'recurring' and origin_entity_id = '00000000-0000-0000-0000-000000009e01'),
  1::bigint, 'confirm posted exactly one transaction'
);

select is(
  (select next_due_date from finance.recurring_transactions where id = '00000000-0000-0000-0000-000000009e01'),
  (current_date + interval '1 month')::date, 'cursor advanced by exactly one month after the first confirm'
);

-- Row shape: origin keys, recurring_id, type, negative amount, occurred_on = the ORIGINAL due date.
select is(
  (select origin_entity_id from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e01'),
  '00000000-0000-0000-0000-000000009e01', 'posted row carries origin_entity_id = the definition id'
);

select is(
  (select recurring_id::text from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e01'),
  '00000000-0000-0000-0000-000000009e01', 'posted row carries recurring_id = the definition id'
);

select is(
  (select type from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e01'),
  'expense', 'posted row has type = expense'
);

select ok(
  (select amount_cents from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e01') < 0,
  'posted row has a NEGATIVE amount_cents (expense sign)'
);

select is(
  (select occurred_on from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e01'),
  current_date, 'occurred_on defaults to the ORIGINAL due date (today), not the post-advance cursor'
);

-- REPLAY: a second confirm call for the SAME (already-advanced) definition must NOT post a
-- second transaction and must NOT advance the cursor a second time. This is not a true
-- "same due date" replay (the cursor already moved), so it proves the general idempotency-key
-- mechanism holds — the true same-due-date replay is exercised next via a fresh definition.
insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-000000009e03', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 8000, 'Streaming', 'monthly', current_date, true);

select lives_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000009e03'::uuid) $$,
  'confirm #1 on definition C succeeds'
);

-- Manually rewind the cursor to simulate a genuine retried call for the SAME occurrence
-- (e.g. a client retry after a dropped response) — the idempotency key is derived from the
-- due date at read time, so this reproduces "same due date confirmed twice".
do $$
declare v_first_id uuid; v_second_id uuid; v_cursor_before_replay date;
begin
  select id into v_first_id from finance.transactions
   where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
     and origin_entity_id = '00000000-0000-0000-0000-000000009e03';

  -- Rewind the cursor back to the ORIGINAL due date being replayed — this reproduces "the same
  -- due date confirmed twice" (e.g. a client retry after a dropped response). If the seam
  -- correctly detects the idempotency-key conflict, the cursor must stay at this rewound value:
  -- it must NOT advance a second time from here.
  update finance.recurring_transactions set next_due_date = (select occurred_on from finance.transactions where id = v_first_id)
   where id = '00000000-0000-0000-0000-000000009e03';
  select next_due_date into v_cursor_before_replay from finance.recurring_transactions where id = '00000000-0000-0000-0000-000000009e03';

  select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000009e03'::uuid) into v_second_id;

  perform set_config('lifeos.test.replay_first_id', v_first_id::text, false);
  perform set_config('lifeos.test.replay_second_id', v_second_id::text, false);
  perform set_config('lifeos.test.cursor_before_replay', v_cursor_before_replay::text, false);
end $$;

select is(
  current_setting('lifeos.test.replay_second_id'),
  current_setting('lifeos.test.replay_first_id'),
  'replaying confirm for the SAME due date returns the SAME transaction id (idempotent)'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e03'),
  1::bigint, 'exactly one transaction exists for the twice-confirmed due date'
);

select is(
  (select next_due_date::text from finance.recurring_transactions where id = '00000000-0000-0000-0000-000000009e03'),
  current_setting('lifeos.test.cursor_before_replay'),
  'row-lock/ordering: replaying the same due date does NOT advance the cursor a second time'
);

-- ---------------------------------------------------------------------------
-- Discard (design.md §4)
-- ---------------------------------------------------------------------------
insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-000000009e04', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 3000, 'Gimnasio', 'weekly', current_date, true);

select lives_ok(
  $$ select finance.discard_recurring_occurrence('00000000-0000-0000-0000-000000009e04'::uuid) $$,
  'discard succeeds'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e04'),
  0::bigint, 'discard creates zero transactions'
);

select is(
  (select next_due_date from finance.recurring_transactions where id = '00000000-0000-0000-0000-000000009e04'),
  (current_date + 7), 'discard advances the cursor by exactly one week'
);

-- ---------------------------------------------------------------------------
-- Confirm error paths leave zero transactions and an unchanged cursor
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000000000'::uuid) $$,
  'P0002', null, 'confirm on a missing id raises P0002'
);

insert into finance.recurring_transactions (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-000000009e05', '00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 4000, 'Pausado', 'monthly', current_date, false);

select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000009e05'::uuid) $$,
  '22023', null, 'confirm on a paused definition raises 22023'
);

select throws_ok(
  $$ select finance.discard_recurring_occurrence('00000000-0000-0000-0000-000000009e05'::uuid) $$,
  '22023', null, 'discard on a paused definition raises 22023'
);

select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000009e01'::uuid, 0) $$,
  '22023', null, 'confirm with a non-positive override amount raises 22023'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e05'),
  0::bigint, 'a raising confirm on the paused definition leaves zero transactions'
);

-- non-member confirm: switch to user B, attempt to confirm A's definition
reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000009b","role":"authenticated"}';

select throws_ok(
  $$ select finance.confirm_recurring_transaction('00000000-0000-0000-0000-000000009e01'::uuid) $$,
  '42501', null, 'confirm by a non-member raises 42501'
);

select throws_ok(
  $$ select finance.discard_recurring_occurrence('00000000-0000-0000-0000-000000009e01'::uuid) $$,
  '42501', null, 'discard by a non-member raises 42501'
);

reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000009a","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Pause / resume / delete (design.md, proposal)
-- ---------------------------------------------------------------------------
update finance.recurring_transactions set active = false, next_due_date = current_date - 5
 where id = '00000000-0000-0000-0000-000000009e04';

select is(
  (select count(*)::bigint from finance.recurring_due where recurring_id = '00000000-0000-0000-0000-000000009e04'),
  0::bigint, 'a paused definition never appears in recurring_due even when overdue'
);

update finance.recurring_transactions set active = true, next_due_date = current_date + 10
 where id = '00000000-0000-0000-0000-000000009e04';

select is(
  (select count(*)::bigint from finance.recurring_due where recurring_id = '00000000-0000-0000-0000-000000009e04'),
  0::bigint, 'resuming to a future date surfaces no backlog in recurring_due'
);

-- Delete: posted transactions referencing the definition keep their history, recurring_id -> NULL.
select lives_ok(
  $$ delete from finance.recurring_transactions where id = '00000000-0000-0000-0000-000000009e01' $$,
  'deleting a definition with posted transactions is never blocked'
);

select is(
  (select recurring_id from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000009aa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-000000009e01'),
  null, 'the deleted definition''s posted transaction keeps its history with recurring_id = NULL'
);

-- ---------------------------------------------------------------------------
-- Origin domain regression (design.md §2, finance-module-api)
-- ---------------------------------------------------------------------------
-- DML on finance.transactions is revoked from `authenticated` (the seam is the only reachable
-- write path); reset to the table-owner role to exercise the CHECK constraint directly.
reset role;
reset request.jwt.claims;

select throws_ok(
  $$ insert into finance.transactions
       (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
        created_by_user_id, origin_module, origin_entity_id, idempotency_key)
     values
       ('00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000009d01',
        '00000000-0000-0000-0000-000000009c01', 'expense', -100, current_date, 'bad origin',
        '00000000-0000-0000-0000-00000000009a', 'not_a_real_module', 'x', 'y') $$,
  '23514', null, 'an unrecognized origin_module value is still rejected after the widening'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000009a","role":"authenticated"}';

select lives_ok(
  $$ select finance.record_transaction('00000000-0000-0000-0000-0000000009aa',
       '00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009c01', 'expense',
       500, current_date) $$,
  'existing manual-origin record_transaction is unaffected by the widened CHECK'
);

select * from finish();
rollback;
