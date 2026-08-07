-- `confirm_recurring_transaction()` gains an income branch, mirroring the existing expense branch
-- exactly (same single INSERT shape, same bare `v_due::text` idempotency key — untouched per the
-- same "do not suffix this key" rule that already applies to the expense branch), with two
-- differences: `type = 'income'` and the posted amount is `+abs(v_amount)` instead of `-abs(...)`.
--
-- THE SIGNATURE DOES NOT CHANGE: `(uuid, bigint, date, text) returns uuid`, same as after the
-- credit-card-payments change. `create or replace` is legal — no DROP, no re-GRANT, no PostgREST
-- reload needed.
--
-- The TRANSFER branch below is BYTE-IDENTICAL to the post-credit-card-payments function — copied
-- verbatim, not re-derived, to avoid re-introducing the min(uuid)/half-pair bug class documented
-- in 20260804090022_finance_recurring_transfer_api.sql.
create or replace function finance.confirm_recurring_transaction(
  p_recurring_id  uuid,
  p_amount_cents  bigint default null,
  p_occurred_on   date   default null,
  p_description   text   default null)
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
  select * into v_def from finance.recurring_transactions
   where id = p_recurring_id for update;
  if not found then
    raise exception 'recurring definition not found' using errcode = 'P0002';
  end if;

  perform core.assert_member(v_def.household_id);

  if not v_def.active then
    raise exception 'cannot confirm a paused recurring definition' using errcode = '22023';
  end if;

  v_due    := v_def.next_due_date;
  v_amount := coalesce(p_amount_cents, v_def.amount_cents);

  if v_amount <= 0 then
    raise exception 'amount must be a positive magnitude' using errcode = '22023';
  end if;

  if v_def.type = 'transfer' then
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

    if v_count = 1 then
      raise exception 'recurring transfer would post a half pair' using errcode = '40001';
    elsif v_count = 0 then
      select id into v_id from finance.transactions
       where household_id = v_def.household_id and origin_module = 'recurring'
         and origin_entity_id = p_recurring_id::text and idempotency_key = v_out_key;
      return v_id;
    end if;

    select id into v_id from finance.transactions
     where household_id = v_def.household_id and origin_module = 'recurring'
       and origin_entity_id = p_recurring_id::text and idempotency_key = v_out_key;
  else
    -- EXPENSE/INCOME branch: identical shape, sign and `type` are the only variables. DO NOT
    -- suffix this key — see 20260804090022's header comment and Decision 5.
    insert into finance.transactions
      (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
       created_by_user_id, origin_module, origin_entity_id, idempotency_key, recurring_id)
    values
      (v_def.household_id, v_def.account_id, v_def.category_id, v_def.type,
       case when v_def.type = 'income' then abs(v_amount) else -abs(v_amount) end,
       coalesce(p_occurred_on, v_due), coalesce(p_description, v_def.description),
       (select auth.uid()), 'recurring', p_recurring_id::text, v_due::text, p_recurring_id)
    on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
      where idempotency_key is not null
    do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from finance.transactions
       where household_id = v_def.household_id and origin_module = 'recurring'
         and origin_entity_id = p_recurring_id::text and idempotency_key = v_due::text;
      return v_id;
    end if;
  end if;

  update finance.recurring_transactions
     set next_due_date = finance.advance_due_date(v_due, v_def.frequency),
         updated_at    = now()
   where id = p_recurring_id;

  return v_id;
end $$;
