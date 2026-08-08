-- "Compra a meses" (installment/BNPL purchase): a single purchase split into N monthly credit-
-- card charges, all posted atomically at creation time — unlike recurring definitions, there is
-- no confirm/discard flow, because the merchant already charged the card once; the card issuer
-- (not the household) is what splits it across statements. The `compra_meses` subtype has been
-- reserved on `finance.transactions.subtype` since finance-transaction-subtypes specifically for
-- this change.

alter table finance.transactions
  add column installment_group_id uuid,
  add column installment_index    int,
  add column installment_count    int;

alter table finance.transactions
  add constraint tx_installment_group check (
    (installment_group_id is null) = (installment_index is null)
    and (installment_group_id is null) = (installment_count is null)
  ),
  add constraint tx_installment_bounds check (
    installment_group_id is null
    or (installment_count >= 2 and installment_index between 1 and installment_count)
  ),
  add constraint tx_installment_requires_subtype check (
    installment_group_id is null or (type = 'expense' and subtype = 'compra_meses')
  );

create index on finance.transactions (installment_group_id) where installment_group_id is not null;

-- Posts all N installments in ONE multi-row INSERT (atomic by statement, same reasoning as the
-- credit-card auto-pay transfer pair in 20260804090022_finance_recurring_transfer_api.sql — a
-- single INSERT...VALUES either commits every row or none). The total is split evenly with any
-- remainder cents folded into the LAST installment, so the sum of installments always equals the
-- original total exactly (never drifts from float rounding). Installment dates use the same
-- clamp-per-month approach as `finance.clamped_day_of_month()`/`advance_due_date()` to avoid
-- Postgres's date+interval overflow behavior shifting the day of month across shorter months.
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
  v_i             int;
  v_amount        bigint;
  v_date          date;
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

  v_base_cents := p_total_amount_cents / p_installment_count;
  v_remainder  := p_total_amount_cents - (v_base_cents * p_installment_count);

  for v_i in 1..p_installment_count loop
    v_amount := v_base_cents + (case when v_i = p_installment_count then v_remainder else 0 end);
    v_date := finance.clamped_day_of_month(
      extract(year  from (p_first_installment_on + make_interval(months => v_i - 1)))::int,
      extract(month from (p_first_installment_on + make_interval(months => v_i - 1)))::int,
      extract(day   from p_first_installment_on)::int
    );

    insert into finance.transactions
      (household_id, account_id, category_id, type, subtype, amount_cents, occurred_on, description,
       created_by_user_id, installment_group_id, installment_index, installment_count)
    values
      (v_household_id, p_account_id, p_category_id, 'expense', 'compra_meses', -abs(v_amount), v_date,
       coalesce(nullif(p_description, ''), 'Compra a meses') || ' (' || v_i || '/' || p_installment_count || ')',
       (select auth.uid()), v_group_id, v_i, p_installment_count);
  end loop;

  return v_group_id;
end $$;

revoke all on function finance.record_installment_purchase(uuid, uuid, bigint, int, date, text) from public, anon;
grant execute on function finance.record_installment_purchase(uuid, uuid, bigint, int, date, text) to authenticated;
