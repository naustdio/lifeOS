-- Redesign "compra a meses": only the FIRST installment posts as a real transaction immediately.
-- The remaining N-1 installments become a bounded `finance.recurring_transactions` definition
-- instead of being posted atomically with future `occurred_on` dates. This closes a real bug:
-- `finance.account_balances` (20260804090005_finance_schema.sql) sums ALL `status = 'posted'`
-- transactions with NO date filter, so posting every future installment today inflated the
-- card's shown debt by the full future total, not just what has actually been charged. Paying
-- off the debt early is now a single "Eliminar" on the recurring definition (or letting it run
-- out), instead of voiding N-1 already-posted future rows one by one.

-- ---------------------------------------------------------------------------
-- §1. finance.recurring_transactions — bounded/installment columns
-- ---------------------------------------------------------------------------

alter table finance.recurring_transactions
  add column installment_group_id   uuid,
  add column installment_anchor_date date,
  add column installments_remaining int,
  add column installment_total      int;

alter table finance.recurring_transactions
  add constraint recurring_installment_group check (
    (installment_group_id is null) = (installment_anchor_date is null)
    and (installment_group_id is null) = (installments_remaining is null)
    and (installment_group_id is null) = (installment_total is null)
  ),
  add constraint recurring_installment_bounds check (
    installment_group_id is null
    or (installment_total >= 2
        and installments_remaining >= 0
        and installments_remaining <= installment_total)
  );

-- ---------------------------------------------------------------------------
-- §2. finance.recurring_due — expose the installment fields (Confirmar sheet, list badge)
-- ---------------------------------------------------------------------------

-- `create or replace view` can only APPEND columns at the end of the output list (cannot
-- reorder/insert) — same constraint noted in 20260804090023_finance_credit_cards.sql when it
-- appended `type`/`to_account_id`. The new installment fields land after those, not beside their
-- logical neighbors.
create or replace view finance.recurring_due with (security_invoker = true) as
select r.id as recurring_id,
       r.household_id,
       r.account_id,
       r.category_id,
       r.amount_cents,
       r.description,
       r.frequency,
       r.next_due_date,
       (current_date - r.next_due_date) as days_overdue,
       r.type,
       r.to_account_id,
       r.installments_remaining,
       r.installment_total
from finance.recurring_transactions r
where r.active
  and r.next_due_date <= current_date;

-- A plain `create or replace view` (not preceded by `drop view`) preserves existing grants; this
-- statement is here anyway, defensively, in case this migration is ever applied against a state
-- where the view had to be dropped and recreated instead of replaced in-place.
grant select on finance.recurring_due to authenticated;

-- ---------------------------------------------------------------------------
-- §3. finance.record_installment_purchase — post #1 now, define the bounded remainder
-- ---------------------------------------------------------------------------

-- The remainder cent now folds into installment #1 (the only one posted immediately) rather than
-- the last one: with only one atomic INSERT left, folding it into the row we already control here
-- keeps every later occurrence (posted one at a time via confirm_recurring_transaction) at one
-- fixed, predictable amount_cents on the recurring definition.
create or replace function finance.record_installment_purchase(
  p_account_id           uuid,
  p_category_id          uuid,
  p_total_amount_cents   bigint,
  p_installment_count    int,
  p_first_installment_on date,
  p_description          text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_household_id  uuid;
  v_group_id      uuid := gen_random_uuid();
  v_base_cents    bigint;
  v_remainder     bigint;
  v_description   text;
begin
  if p_total_amount_cents <= 0 then
    raise exception 'installment total must be a positive magnitude' using errcode = '22023';
  end if;
  if p_installment_count < 2 or p_installment_count > 60 then
    raise exception 'installment count must be between 2 and 60' using errcode = '22023';
  end if;

  select a.household_id into v_household_id
    from finance.accounts a
   where a.id = p_account_id and a.archived_at is null;
  if not found then
    raise exception 'account not found' using errcode = '22023';
  end if;

  perform core.assert_member(v_household_id);

  if not exists (
    select 1 from finance.accounts a
     where a.id = p_account_id and a.type = 'credit_card'
  ) then
    raise exception 'installment purchases require a credit_card account' using errcode = '22023';
  end if;

  if not exists (
    select 1 from finance.categories c
     where c.id = p_category_id and c.household_id = v_household_id and c.kind = 'expense'
  ) then
    raise exception 'category not found or not an expense category' using errcode = '22023';
  end if;

  v_base_cents  := p_total_amount_cents / p_installment_count;
  v_remainder   := p_total_amount_cents - (v_base_cents * p_installment_count);
  v_description := coalesce(nullif(p_description, ''), 'Compra a meses');

  insert into finance.transactions
    (household_id, account_id, category_id, type, subtype, amount_cents, occurred_on, description,
     created_by_user_id, installment_group_id, installment_index, installment_count)
  values
    (v_household_id, p_account_id, p_category_id, 'expense', 'compra_meses',
     -abs(v_base_cents + v_remainder), p_first_installment_on,
     v_description || ' (1/' || p_installment_count || ')',
     (select auth.uid()), v_group_id, 1, p_installment_count);

  -- Installments 2..N: a single bounded recurring definition, not N-1 more posted rows.
  insert into finance.recurring_transactions
    (household_id, account_id, category_id, amount_cents, description, frequency, next_due_date,
     installment_group_id, installment_anchor_date, installments_remaining, installment_total)
  values
    (v_household_id, p_account_id, p_category_id, v_base_cents, v_description, 'monthly',
     finance.clamped_day_of_month(
       extract(year  from (p_first_installment_on + interval '1 month'))::int,
       extract(month from (p_first_installment_on + interval '1 month'))::int,
       extract(day   from p_first_installment_on)::int
     ),
     v_group_id, p_first_installment_on, p_installment_count - 1, p_installment_count);

  return v_group_id;
end $$;

-- ---------------------------------------------------------------------------
-- §4. finance.confirm_recurring_transaction — post one installment occurrence, clamped-advance
-- ---------------------------------------------------------------------------

-- The transfer branch below is BYTE-IDENTICAL to the pre-change function
-- (20260804090022_finance_recurring_transfer_api.sql) — transfer definitions never carry
-- installment_group_id, so it needs no awareness of installments at all. Only the expense branch
-- and the shared cursor-advance at the end gain installment handling.
create or replace function finance.confirm_recurring_transaction(
  p_recurring_id  uuid,
  p_amount_cents  bigint default null,
  p_occurred_on   date   default null,
  p_description   text   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_def         finance.recurring_transactions;
  v_due         date;
  v_amount      bigint;
  v_id          uuid;
  v_group_id    uuid;
  v_out_key     text;
  v_in_key      text;
  v_count       int;
  v_index       int;
  v_subtype     text;
  v_description text;
  v_next_due    date;
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
    -- EXPENSE/INCOME branch: identical shape, sign and `type` are the only variables (unchanged
    -- from 20260804090026). installment_group_id is not null only for a bounded installment
    -- definition (always `type = 'expense'`, finance.record_installment_purchase) — every other
    -- expense/income definition keeps the byte-identical pre-change insert (no subtype, no
    -- installment_* columns, bare v_due::text idempotency key — design.md Decision 5).
    v_description := coalesce(p_description, v_def.description);

    if v_def.installment_group_id is not null then
      v_index       := v_def.installment_total - v_def.installments_remaining + 1;
      v_subtype     := 'compra_meses';
      v_description := v_description || ' (' || v_index || '/' || v_def.installment_total || ')';
    end if;

    insert into finance.transactions
      (household_id, account_id, category_id, type, subtype, amount_cents, occurred_on, description,
       created_by_user_id, origin_module, origin_entity_id, idempotency_key, recurring_id,
       installment_group_id, installment_index, installment_count)
    values
      (v_def.household_id, v_def.account_id, v_def.category_id, v_def.type, v_subtype,
       case when v_def.type = 'income' then abs(v_amount) else -abs(v_amount) end,
       coalesce(p_occurred_on, v_due), v_description,
       (select auth.uid()), 'recurring', p_recurring_id::text, v_due::text, p_recurring_id,
       v_def.installment_group_id, v_index, v_def.installment_total)
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

  if v_def.installment_group_id is not null then
    if v_def.installments_remaining - 1 <= 0 then
      update finance.recurring_transactions
         set installments_remaining = 0, active = false, updated_at = now()
       where id = p_recurring_id;
    else
      v_next_due := finance.clamped_day_of_month(
        extract(year  from (v_def.installment_anchor_date + make_interval(months => v_index)))::int,
        extract(month from (v_def.installment_anchor_date + make_interval(months => v_index)))::int,
        extract(day   from v_def.installment_anchor_date)::int
      );
      update finance.recurring_transactions
         set next_due_date = v_next_due, installments_remaining = installments_remaining - 1,
             updated_at = now()
       where id = p_recurring_id;
    end if;
  else
    update finance.recurring_transactions
       set next_due_date = finance.advance_due_date(v_due, v_def.frequency),
           updated_at    = now()
     where id = p_recurring_id;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- §5. finance.discard_recurring_occurrence — skipping an installment also consumes it
-- ---------------------------------------------------------------------------

create or replace function finance.discard_recurring_occurrence(p_recurring_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare v_def finance.recurring_transactions; v_next date; v_index int;
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

  if v_def.installment_group_id is not null then
    v_index := v_def.installment_total - v_def.installments_remaining + 1;
    if v_def.installments_remaining - 1 <= 0 then
      update finance.recurring_transactions
         set installments_remaining = 0, active = false, updated_at = now()
       where id = p_recurring_id;
      return v_def.next_due_date;
    end if;
    v_next := finance.clamped_day_of_month(
      extract(year  from (v_def.installment_anchor_date + make_interval(months => v_index)))::int,
      extract(month from (v_def.installment_anchor_date + make_interval(months => v_index)))::int,
      extract(day   from v_def.installment_anchor_date)::int
    );
    update finance.recurring_transactions
       set next_due_date = v_next, installments_remaining = installments_remaining - 1, updated_at = now()
     where id = p_recurring_id;
    return v_next;
  end if;

  v_next := finance.advance_due_date(v_def.next_due_date, v_def.frequency);

  update finance.recurring_transactions
     set next_due_date = v_next, updated_at = now()
   where id = p_recurring_id;

  return v_next;
end $$;
