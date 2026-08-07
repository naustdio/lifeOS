-- `confirm_recurring_transaction()` gains a transfer branch. Per design.md §2. Change:
-- finance-credit-card-payments (CC-004).
--
-- Renumbered from the design's planned `...019`/`...020` to `...022` — see the header comment in
-- 20260804090021_finance_recurring_transfer_shape.sql for the collision explanation.
--
-- THE SIGNATURE DOES NOT CHANGE: `(uuid, bigint, date, text) returns uuid`. From/to accounts come
-- from the definition row, not new parameters, and the return stays the out-leg's transaction id
-- (Decision 4). `create or replace` is therefore legal — no DROP, no re-GRANT, no PostgREST reload.
--
-- The EXPENSE branch below is BYTE-IDENTICAL to the pre-change function: the same single INSERT,
-- the same bare `v_due::text` idempotency key, the same ON CONFLICT/replay resolution shape. This
-- is deliberate and is the single most dangerous line in this file to get wrong (design.md
-- Decision 5) — proven by 0xx_finance_recurring_expense_regression.sql run unchanged both before
-- and after this migration (CC-003/CC-005).
create or replace function finance.confirm_recurring_transaction(
  p_recurring_id  uuid,
  p_amount_cents  bigint default null,   -- null = use the definition's amount
  p_occurred_on   date   default null,   -- null = use the ORIGINAL next_due_date (proposal)
  p_description   text   default null)   -- null = use the definition's description
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_def      finance.recurring_transactions;
  v_due      date;
  v_amount   bigint;
  v_id       uuid;
  v_group_id uuid;
  v_out_key  text;
  v_in_key   text;
  v_count    int;
begin
  -- Lock the definition row: two concurrent confirms must serialize, or both could read the same
  -- `next_due_date`, and the second would advance the cursor twice for one posted transaction (or,
  -- for a transfer, could both attempt to insert the same pair). UNCHANGED from the pre-change
  -- function; this lock is the primary concurrency-safety mechanism for BOTH branches.
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
  -- idempotency key(s) are derived from it, so a replay of the SAME occurrence must produce the
  -- SAME key(s). Deriving the key after the update (or from current_date) would make every replay
  -- a new key and re-post the occurrence — the exact double-post this design exists to prevent.
  v_due    := v_def.next_due_date;
  v_amount := coalesce(p_amount_cents, v_def.amount_cents);

  if v_amount <= 0 then
    raise exception 'amount must be a positive magnitude' using errcode = '22023';
  end if;

  if v_def.type = 'transfer' then
    -- §2.3 Tenancy: RLS is bypassed inside a definer, so both accounts are re-validated against
    -- v_def.household_id explicitly — the definition's own FK does not constrain to_account_id to
    -- the same household. Also re-guard the shape invariant (defense in depth against a row that
    -- somehow reached here with a null/self to_account_id).
    if v_def.to_account_id is null or v_def.to_account_id = v_def.account_id then
      raise exception 'a transfer recurring definition requires a distinct destination account'
        using errcode = '22023';
    end if;

    if not exists (select 1 from finance.accounts a where a.id = v_def.to_account_id
                    and a.household_id = v_def.household_id and a.archived_at is null)
       or not exists (select 1 from finance.accounts a where a.id = v_def.account_id
                    and a.household_id = v_def.household_id and a.archived_at is null) then
      raise exception 'both transfer accounts must belong to this household' using errcode = '42501';
    end if;

    -- §2.2 The idempotency mechanism. Per-leg suffixes derived from the PRE-ADVANCE due date, so
    -- a replay of the same occurrence reproduces the SAME two keys.
    v_group_id := gen_random_uuid();
    v_out_key  := v_due::text || ':out';
    v_in_key   := v_due::text || ':in';

    with ins as (
      insert into finance.transactions
        (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
         created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key,
         recurring_id)
      values
        (v_def.household_id, v_def.account_id,    null, 'transfer', -abs(v_amount),
         coalesce(p_occurred_on, v_due), coalesce(p_description, v_def.description),
         (select auth.uid()), v_group_id, 'recurring', p_recurring_id::text, v_out_key,
         p_recurring_id),
        (v_def.household_id, v_def.to_account_id, null, 'transfer',  abs(v_amount),
         coalesce(p_occurred_on, v_due), coalesce(p_description, v_def.description),
         (select auth.uid()), v_group_id, 'recurring', p_recurring_id::text, v_in_key,
         p_recurring_id)
      on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
        where idempotency_key is not null
      do nothing
      returning id
    )
    select count(*)::int into v_count from ins;
    -- NOTE: deliberately not extracting the out-leg id from `ins` via an aggregate — uuid has no
    -- built-in min()/max() aggregate in Postgres ("function min(uuid) does not exist"), a real
    -- bug caught by 0xx_finance_recurring_transfer_half_pair_guard.sql during Slice A apply. The
    -- out-leg id is always resolved by an explicit keyed SELECT instead (both below and in the
    -- v_count=0 branch), which is simpler and avoids the aggregate entirely.

    if v_count = 1 then
      -- Structurally unreachable (the two keys are inserted by ONE statement and can only
      -- conflict with a committed pair, which conflicts on BOTH). Fail closed anyway: the raise
      -- aborts the transaction, so the orphan leg is never committed. Named test: the
      -- half-pair-guard pgTAP file (CC-008).
      raise exception 'recurring transfer would post a half pair' using errcode = '40001';
    elsif v_count = 0 then
      -- Honest replay, or lost the row lock race: the winner committed both legs before releasing
      -- the definition lock, so this SELECT is guaranteed to see them.
      select id into v_id from finance.transactions
       where household_id = v_def.household_id and origin_module = 'recurring'
         and origin_entity_id = p_recurring_id::text and idempotency_key = v_out_key;
      return v_id;                          -- cursor already advanced by the winning call
    end if;

    -- v_count = 2: both legs just committed by THIS call. Resolve the out-leg id by key (same
    -- lookup shape as the replay branch above) and fall through to the shared cursor-advance.
    select id into v_id from finance.transactions
     where household_id = v_def.household_id and origin_module = 'recurring'
       and origin_entity_id = p_recurring_id::text and idempotency_key = v_out_key;
  else
    -- EXPENSE branch: BYTE-IDENTICAL to the pre-change function. DO NOT suffix this key — see the
    -- module header and design.md Decision 5.
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
  end if;

  update finance.recurring_transactions
     set next_due_date = finance.advance_due_date(v_due, v_def.frequency),
         updated_at    = now()
   where id = p_recurring_id;

  return v_id;
end $$;
