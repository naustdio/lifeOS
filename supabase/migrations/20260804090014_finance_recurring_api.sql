-- The recurring seam: two SECURITY DEFINER PL/pgSQL functions — confirm (post + advance the
-- cursor, atomically) and discard (advance the cursor, post nothing). Per design.md §4.
-- Change: finance-recurring (R-003).

-- Confirm: ONE transaction, atomically, for the CURRENT due date — then advance the cursor.
create or replace function finance.confirm_recurring_transaction(
  p_recurring_id  uuid,
  p_amount_cents  bigint default null,   -- null = use the definition's amount
  p_occurred_on   date   default null,   -- null = use the ORIGINAL next_due_date (proposal)
  p_description   text   default null)   -- null = use the definition's description
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_def    finance.recurring_transactions;
  v_due    date;
  v_amount bigint;
  v_id     uuid;
begin
  -- Lock the definition row: two concurrent confirms must serialize, or both could read the same
  -- `next_due_date`, and the second would advance the cursor twice for one posted transaction.
  select * into v_def from finance.recurring_transactions
   where id = p_recurring_id for update;
  if not found then
    raise exception 'recurring definition not found' using errcode = 'P0002';
  end if;

  perform core.assert_member(v_def.household_id);          -- same opener as every seam function

  if not v_def.active then
    raise exception 'cannot confirm a paused recurring definition' using errcode = '22023';
  end if;

  -- CRITICAL ORDERING: read the CURRENT next_due_date into v_due BEFORE advancing. The
  -- idempotency key is derived from it, so a replay of the SAME occurrence must produce the SAME
  -- key. Deriving the key after the update (or from current_date) would make every replay a new
  -- key and re-post the expense — the exact double-post this design exists to prevent.
  v_due    := v_def.next_due_date;
  v_amount := coalesce(p_amount_cents, v_def.amount_cents);

  if v_amount <= 0 then
    raise exception 'amount must be a positive magnitude' using errcode = '22023';
  end if;

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, origin_module, origin_entity_id, idempotency_key, recurring_id)
  values
    (v_def.household_id, v_def.account_id, v_def.category_id, 'expense', -abs(v_amount),
     coalesce(p_occurred_on, v_due), coalesce(p_description, v_def.description),
     (select auth.uid()), 'recurring', p_recurring_id::text, v_due::text, p_recurring_id)
  on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then                    -- lost the race, or an honest replay
    select id into v_id from finance.transactions
     where household_id = v_def.household_id and origin_module = 'recurring'
       and origin_entity_id = p_recurring_id::text and idempotency_key = v_due::text;
    return v_id;                          -- cursor already advanced by the winning call
  end if;

  update finance.recurring_transactions
     set next_due_date = finance.advance_due_date(v_due, v_def.frequency),
         updated_at    = now()
   where id = p_recurring_id;

  return v_id;
end $$;

-- Discard: advance the cursor by exactly one period, insert NOTHING.
create or replace function finance.discard_recurring_occurrence(p_recurring_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare v_def finance.recurring_transactions; v_next date;
begin
  select * into v_def from finance.recurring_transactions
   where id = p_recurring_id for update;
  if not found then
    raise exception 'recurring definition not found' using errcode = 'P0002';
  end if;

  perform core.assert_member(v_def.household_id);

  if not v_def.active then
    raise exception 'cannot discard on a paused recurring definition' using errcode = '22023';
  end if;

  v_next := finance.advance_due_date(v_def.next_due_date, v_def.frequency);

  update finance.recurring_transactions
     set next_due_date = v_next, updated_at = now()
   where id = p_recurring_id;

  return v_next;
end $$;

grant execute on function
  finance.confirm_recurring_transaction(uuid, bigint, date, text),
  finance.discard_recurring_occurrence(uuid),
  finance.advance_due_date(date, text)
  to authenticated;
