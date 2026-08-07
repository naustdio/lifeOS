-- pgTAP — CC-007 replay. Calling confirm twice for the SAME occurrence (cursor reset to the same
-- next_due_date) posts nothing new, returns the same out-leg id, cursor doesn't advance again,
-- count(*) filter (transfer_group_id = g) stays exactly 2. Per design.md §2.2.

begin;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000fd001', 'replay-a@example.com', '{"full_name":"Replay A"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000000fdaaa', 'replay household', '00000000-0000-0000-0000-0000000fd001', '00000000-0000-0000-0000-0000000fd001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000000fdaaa', '00000000-0000-0000-0000-0000000fd001', 'owner')
on conflict do nothing;

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id)
values
  ('00000000-0000-0000-0000-0000000fdd01', '00000000-0000-0000-0000-0000000fdaaa', 'Efectivo Replay', 'cash', 'household', '00000000-0000-0000-0000-0000000fd001'),
  ('00000000-0000-0000-0000-0000000fdd02', '00000000-0000-0000-0000-0000000fdaaa', 'Tarjeta Replay', 'credit_card', 'household', '00000000-0000-0000-0000-0000000fd001');

insert into finance.recurring_transactions (id, household_id, account_id, to_account_id, type, category_id, amount_cents, description, frequency, next_due_date, active)
values ('00000000-0000-0000-0000-0000000fde01', '00000000-0000-0000-0000-0000000fdaaa', '00000000-0000-0000-0000-0000000fdd01', '00000000-0000-0000-0000-0000000fdd02', 'transfer', null, 15000, 'Pago tarjeta Replay', 'monthly', current_date, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000fd001","role":"authenticated"}';

do $$
declare
  v_first_id  uuid;
  v_second_id uuid;
  v_cursor_before_replay date;
  v_group    uuid;
begin
  select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000fde01'::uuid) into v_first_id;

  select transfer_group_id into v_group from finance.transactions
   where household_id = '00000000-0000-0000-0000-0000000fdaaa' and origin_module = 'recurring'
     and origin_entity_id = '00000000-0000-0000-0000-0000000fde01' and amount_cents < 0;

  -- Rewind the cursor back to the ORIGINAL due date being replayed (simulates a client retry
  -- after a dropped response) — the idempotency keys are derived from it, so this reproduces
  -- "the same occurrence confirmed twice".
  update finance.recurring_transactions set next_due_date = current_date
   where id = '00000000-0000-0000-0000-0000000fde01';
  select next_due_date into v_cursor_before_replay from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fde01';

  select finance.confirm_recurring_transaction('00000000-0000-0000-0000-0000000fde01'::uuid) into v_second_id;

  perform set_config('lifeos.test.replay_first_id', v_first_id::text, false);
  perform set_config('lifeos.test.replay_second_id', v_second_id::text, false);
  perform set_config('lifeos.test.cursor_before_replay', v_cursor_before_replay::text, false);
  perform set_config('lifeos.test.group_id', v_group::text, false);
end $$;

select is(
  current_setting('lifeos.test.replay_second_id'),
  current_setting('lifeos.test.replay_first_id'),
  'replaying confirm for the SAME transfer occurrence returns the SAME out-leg transaction id'
);

select is(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fdaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fde01'),
  2::bigint, 'exactly 2 rows exist total after a replay (nothing new posted)'
);

select is(
  (select count(*)::bigint from finance.transactions
    where transfer_group_id = current_setting('lifeos.test.group_id')::uuid),
  2::bigint, 'the SAME transfer_group_id still has exactly 2 rows after the replay'
);

select is(
  (select next_due_date::text from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000fde01'),
  current_setting('lifeos.test.cursor_before_replay'),
  'replaying the same occurrence does NOT advance the cursor a second time'
);

-- No point in time may show exactly one leg without its counterpart: proven implicitly by the
-- pair-count assertions above (always 0 or 2, never 1) plus this explicit odd-count guard.
select isnt(
  (select count(*)::bigint from finance.transactions
    where household_id = '00000000-0000-0000-0000-0000000fdaaa' and origin_module = 'recurring'
      and origin_entity_id = '00000000-0000-0000-0000-0000000fde01') % 2,
  1::bigint, 'the row count for this occurrence is never odd (never a single observable leg)'
);

select * from finish();
rollback;
