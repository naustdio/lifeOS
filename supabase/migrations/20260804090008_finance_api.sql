-- The Finance write seam: SECURITY DEFINER PL/pgSQL functions. This is the ONLY path that can
-- write to finance.accounts/finance.transactions (DML revoked from authenticated in
-- finance_security.sql; EXECUTE granted here). Per design.md §5. Sub-slice 2A/2B.
--
-- DEVIATION FROM design.md's literal `OriginRef` TS type (documented, not silent): the SQL
-- functions that resolve a transaction by origin (`update_origin_transaction`,
-- `void_transaction`, `find_by_origin`) need `household_id` to scope the lookup safely — every
-- other seam function takes `p_household_id` explicitly per the established convention
-- (design.md §5.6 "household_id is a parameter, not session-resolved"), and origin_entity_id
-- alone is not otherwise scoped. The TS facade's `OriginRef` therefore carries `householdId`
-- too. Nothing about a transaction's own tenancy changes; this only closes a parameter gap
-- between the prose interface and the SQL bodies design.md itself describes.

-- ---------------------------------------------------------------------------
-- finance.create_account — exact function per design.md §5.6.
-- ---------------------------------------------------------------------------
create or replace function finance.create_account(
  p_household_id          uuid,
  p_name                  text,
  p_type                  text,
  p_opening_balance_cents bigint default 0,
  p_visibility            text   default 'household',
  p_sort_order            int    default 0,
  -- liability detail: all five required when p_type = 'liability', all null otherwise
  p_original_amount_cents bigint default null,
  p_interest_rate_bp      int    default null,
  p_term_months           int    default null,
  p_monthly_payment_cents bigint default null,
  p_start_date            date   default null,
  -- savings-goal detail: target amount required when p_type = 'savings_goal', null otherwise
  p_target_amount_cents   bigint default null,
  p_target_date           date   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user       uuid := (select auth.uid());
  v_account_id uuid;
  v_has_liab   boolean := p_original_amount_cents is not null or p_interest_rate_bp is not null
                       or p_term_months is not null or p_monthly_payment_cents is not null
                       or p_start_date is not null;
  v_has_goal   boolean := p_target_amount_cents is not null or p_target_date is not null;
begin
  perform core.assert_member(p_household_id);          -- same opener as every other seam function

  -- detail block must match the type exactly: required when owed, forbidden otherwise
  if p_type = 'liability' then
    if p_original_amount_cents is null or p_interest_rate_bp is null or p_term_months is null
       or p_monthly_payment_cents is null or p_start_date is null or v_has_goal then
      raise exception 'liability accounts require complete loan detail and no goal detail'
        using errcode = '22023';
    end if;
  elsif p_type = 'savings_goal' then
    if p_target_amount_cents is null or v_has_liab then
      raise exception 'savings-goal accounts require a target amount and no loan detail'
        using errcode = '22023';
    end if;
  elsif v_has_liab or v_has_goal then
    raise exception 'detail fields are not applicable to this account type' using errcode = '22023';
  end if;

  -- liability balances are negative principal walking toward zero (§3.3)
  if p_type in ('credit_card','liability') and p_opening_balance_cents > 0 then
    raise exception 'a liability opening balance is zero or negative' using errcode = '22023';
  end if;

  insert into finance.accounts (household_id, name, type, visibility, owner_user_id,
                                opening_balance_cents, sort_order)
  values (p_household_id, btrim(p_name), p_type, p_visibility, v_user,
          p_opening_balance_cents, p_sort_order)
  returning id into v_account_id;     -- `class` omitted on purpose: the schema trigger derives it

  if p_type = 'liability' then
    insert into finance.account_liability_details
      (account_id, original_amount_cents, interest_rate_bp, term_months,
       monthly_payment_cents, start_date)
    values (v_account_id, p_original_amount_cents, p_interest_rate_bp, p_term_months,
            p_monthly_payment_cents, p_start_date);
  elsif p_type = 'savings_goal' then
    insert into finance.account_goal_details (account_id, target_amount_cents, target_date)
    values (v_account_id, p_target_amount_cents, p_target_date);
  end if;

  return v_account_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.record_transaction — single-leg income/expense entry. Idempotency pattern
-- exactly per design.md §5.3.
-- ---------------------------------------------------------------------------
create or replace function finance.record_transaction(
  p_household_id     uuid,
  p_account_id       uuid,
  p_category_id      uuid,
  p_kind             text,      -- 'income' | 'expense'
  p_amount_cents     bigint,    -- positive magnitude; sign derived here
  p_occurred_on      date,
  p_description      text default '',
  p_origin_module    text default 'manual',
  p_origin_entity_id text default null,
  p_idempotency_key  text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid;
  v_signed bigint;
begin
  perform core.assert_member(p_household_id);

  if p_kind not in ('income', 'expense') then
    raise exception 'kind must be income or expense' using errcode = '22023';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'amount must be a positive magnitude' using errcode = '22023';
  end if;

  v_signed := case when p_kind = 'income' then abs(p_amount_cents) else -abs(p_amount_cents) end;

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, origin_module, origin_entity_id, idempotency_key)
  values
    (p_household_id, p_account_id, p_category_id, p_kind, v_signed, p_occurred_on, p_description,
     (select auth.uid()), p_origin_module, p_origin_entity_id, p_idempotency_key)
  on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then                    -- lost the race, or an honest replay
    select id into v_id from finance.transactions
     where household_id = p_household_id and origin_module = p_origin_module
       and origin_entity_id = p_origin_entity_id and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.record_transfer — inserts both legs of a transfer pair in one statement's
-- worth of work (same transfer_group_id, opposite signs, sum zero). The per-leg
-- idempotency suffix (:out/:in) keeps the household-prefixed unique index a valid
-- arbiter for each row while the whole pair replays as one logical operation.
-- ---------------------------------------------------------------------------
create or replace function finance.record_transfer(
  p_household_id     uuid,
  p_from_account_id  uuid,
  p_to_account_id    uuid,
  p_amount_cents     bigint,    -- positive magnitude
  p_occurred_on      date,
  p_description      text default '',
  p_origin_module    text default 'manual',
  p_origin_entity_id text default null,
  p_idempotency_key  text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_group_id uuid;
  v_out_key  text := case when p_idempotency_key is not null then p_idempotency_key || ':out' end;
  v_in_key   text := case when p_idempotency_key is not null then p_idempotency_key || ':in' end;
  v_inserted uuid;
begin
  perform core.assert_member(p_household_id);

  if p_amount_cents <= 0 then
    raise exception 'transfer amount must be a positive magnitude' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'a transfer requires two distinct accounts' using errcode = '22023';
  end if;

  v_group_id := gen_random_uuid();

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key)
  values
    (p_household_id, p_from_account_id, null, 'transfer', -abs(p_amount_cents), p_occurred_on,
     p_description, (select auth.uid()), v_group_id, p_origin_module, p_origin_entity_id, v_out_key)
  on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning transfer_group_id into v_inserted;

  if v_inserted is null then
    if p_idempotency_key is null then
      -- unreachable in practice (null keys never conflict), but fail closed rather than
      -- silently no-op a manual transfer.
      raise exception 'transfer insert unexpectedly conflicted' using errcode = '22023';
    end if;
    -- lost the race, or an honest replay: both legs already exist (or are about to under
    -- the other caller's transaction) — resolve the committed group and return it.
    select transfer_group_id into v_group_id
      from finance.transactions
     where household_id = p_household_id and origin_module = p_origin_module
       and origin_entity_id = p_origin_entity_id and idempotency_key = v_out_key;
    return v_group_id;
  end if;

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key)
  values
    (p_household_id, p_to_account_id, null, 'transfer', abs(p_amount_cents), p_occurred_on,
     p_description, (select auth.uid()), v_group_id, p_origin_module, p_origin_entity_id, v_in_key);

  return v_group_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.update_transaction — exact function per design.md §5.4.
-- ---------------------------------------------------------------------------
create or replace function finance.update_transaction(
  p_transaction_id uuid,
  p_account_id     uuid   default null,   -- null = leave unchanged
  p_category_id    uuid   default null,
  p_amount_cents   bigint default null,   -- positive magnitude; sign re-derived from type
  p_occurred_on    date   default null,
  p_description    text   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tx finance.transactions;
begin
  select * into v_tx from finance.transactions where id = p_transaction_id;
  if not found then raise exception 'transaction not found' using errcode = 'P0002'; end if;

  perform core.assert_member(v_tx.household_id);
  if not finance.can_read_account(v_tx.account_id) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  if v_tx.status = 'void' then
    raise exception 'cannot edit a voided transaction' using errcode = '22023';
  end if;

  if p_account_id is not null and p_account_id <> v_tx.account_id then
    -- a transfer leg's meaning is defined by its pair; moving one leg is not expressible
    if v_tx.type = 'transfer' then
      raise exception 'cannot move a transfer leg; void the transfer and record it again'
        using errcode = '22023';
    end if;
    -- destination must be in the SAME space, visible to the caller, and not archived
    if not exists (select 1 from finance.accounts a
                    where a.id = p_account_id
                      and a.household_id = v_tx.household_id
                      and a.archived_at is null)
       or not finance.can_read_account(p_account_id) then
      raise exception 'invalid destination account' using errcode = '42501';
    end if;
  end if;

  update finance.transactions set
    account_id   = coalesce(p_account_id, account_id),
    category_id  = coalesce(p_category_id, category_id),
    amount_cents = case when p_amount_cents is null then amount_cents
                        when type = 'expense' then -abs(p_amount_cents)
                        else abs(p_amount_cents) end,
    occurred_on  = coalesce(p_occurred_on, occurred_on),
    description  = coalesce(p_description, description),
    updated_at   = now()
  where id = p_transaction_id;

  return p_transaction_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.update_origin_transaction — resolves (household_id, origin_module,
-- origin_entity_id) -> transaction id, then delegates to update_transaction. Exactly one
-- code path carries the guards (design.md §5.4 "sharpening vs proposal" note).
-- ---------------------------------------------------------------------------
create or replace function finance.update_origin_transaction(
  p_household_id     uuid,
  p_origin_module     text,
  p_origin_entity_id  text,
  p_account_id        uuid   default null,
  p_category_id       uuid   default null,
  p_amount_cents      bigint default null,
  p_occurred_on       date   default null,
  p_description       text   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform core.assert_member(p_household_id);

  select id into v_id from finance.transactions
   where household_id = p_household_id and origin_module = p_origin_module
     and origin_entity_id = p_origin_entity_id
   order by created_at desc limit 1;
  if v_id is null then
    raise exception 'transaction not found for origin' using errcode = 'P0002';
  end if;

  return finance.update_transaction(v_id, p_account_id, p_category_id, p_amount_cents,
                                     p_occurred_on, p_description);
end $$;

-- ---------------------------------------------------------------------------
-- finance.void_transaction — transitions to void; voiding one leg of a transfer pair
-- voids the linked leg in the same operation (same transfer_group_id).
-- ---------------------------------------------------------------------------
create or replace function finance.void_transaction(
  p_transaction_id uuid,
  p_reason         text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tx finance.transactions; v_actor uuid := (select auth.uid());
begin
  select * into v_tx from finance.transactions where id = p_transaction_id;
  if not found then raise exception 'transaction not found' using errcode = 'P0002'; end if;

  perform core.assert_member(v_tx.household_id);
  if not finance.can_read_account(v_tx.account_id) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  if v_tx.status = 'void' then
    raise exception 'transaction already void' using errcode = '22023';
  end if;

  if v_tx.type = 'transfer' and v_tx.transfer_group_id is not null then
    update finance.transactions
       set status = 'void', voided_at = now(), voided_by_user_id = v_actor, void_reason = p_reason
     where transfer_group_id = v_tx.transfer_group_id
       and status = 'posted';
  else
    update finance.transactions
       set status = 'void', voided_at = now(), voided_by_user_id = v_actor, void_reason = p_reason
     where id = p_transaction_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- finance.void_origin_transaction — origin-addressed void, mirrors update_origin_transaction.
-- ---------------------------------------------------------------------------
create or replace function finance.void_origin_transaction(
  p_household_id     uuid,
  p_origin_module     text,
  p_origin_entity_id  text,
  p_reason            text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform core.assert_member(p_household_id);

  select id into v_id from finance.transactions
   where household_id = p_household_id and origin_module = p_origin_module
     and origin_entity_id = p_origin_entity_id
   order by created_at desc limit 1;
  if v_id is null then
    raise exception 'transaction not found for origin' using errcode = 'P0002';
  end if;

  perform finance.void_transaction(v_id, p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- finance.find_by_origin — never throws when absent, returns NULL instead.
-- ---------------------------------------------------------------------------
create or replace function finance.find_by_origin(
  p_household_id     uuid,
  p_origin_module     text,
  p_origin_entity_id  text)
returns table (id uuid, household_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
begin
  perform core.assert_member(p_household_id);

  return query
    select t.id, t.household_id, t.status
      from finance.transactions t
     where t.household_id = p_household_id and t.origin_module = p_origin_module
       and t.origin_entity_id = p_origin_entity_id
     order by t.created_at desc limit 1;
end $$;

-- ---------------------------------------------------------------------------
-- Grant EXECUTE on the whole seam to authenticated. Direct DML on the underlying
-- finance.accounts/finance.transactions tables remains revoked (finance_security.sql) —
-- this is the only reachable write path.
-- ---------------------------------------------------------------------------
grant execute on function
  finance.create_account(uuid, text, text, bigint, text, int, bigint, int, int, bigint, date, bigint, date),
  finance.record_transaction(uuid, uuid, uuid, text, bigint, date, text, text, text, text),
  finance.record_transfer(uuid, uuid, uuid, bigint, date, text, text, text, text),
  finance.update_transaction(uuid, uuid, uuid, bigint, date, text),
  finance.update_origin_transaction(uuid, text, text, uuid, uuid, bigint, date, text),
  finance.void_transaction(uuid, text),
  finance.void_origin_transaction(uuid, text, text, text),
  finance.find_by_origin(uuid, text, text)
  to authenticated;
