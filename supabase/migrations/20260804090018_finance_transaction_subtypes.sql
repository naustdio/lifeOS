-- Finance Transactions — Sub-types (change: finance-transaction-subtypes). Adds a nullable,
-- value-set-CHECKed `subtype` column and a single pairing helper enforced inside the three write
-- RPCs. See design.md §1/§1a/§1b for the drop-then-recreate rationale: `create or replace
-- function` cannot add a parameter without creating an ambiguous overload (42725) that breaks
-- every pre-change caller of `record_transaction`/`record_transfer`/`update_transaction`.

alter table finance.transactions add column subtype text;

alter table finance.transactions add constraint transactions_subtype_whitelist
  check (subtype is null or subtype in
    ('pago','reembolso','devolucion_efectivo','pago_tarjeta','compra_meses'));

-- The type<->subtype pairing, in exactly ONE place (design.md §"Technical Approach"). The CHECK
-- above constrains only the value SET; this helper constrains which sub-type belongs to which
-- type. `compra_meses` passes the CHECK but fails this helper for EVERY type — reserved, not
-- reachable through any RPC (Decision 6). Change 5b (finance-installment-groups) opens it by
-- editing one `when` branch here, with no CHECK migration.
create or replace function finance.subtype_matches_type(p_type text, p_subtype text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_subtype is null                                then true
    when p_subtype = 'pago'                               then p_type = 'expense'
    when p_subtype in ('reembolso','devolucion_efectivo') then p_type = 'income'
    when p_subtype = 'pago_tarjeta'                       then p_type = 'transfer'
    else false      -- 'compra_meses' and any future value: unreachable until 5b opens it
  end $$;

-- ---------------------------------------------------------------------------
-- Load-bearing: DROP each RPC at its exact current signature before re-creating with the new
-- trailing parameter(s). `create or replace function` cannot add a parameter — it creates a new
-- overload, and the old N-arg PostgREST call then raises 42725 "function ... is not unique"
-- (design.md §1a, Decision 2). `finance.update_origin_transaction` calls `update_transaction`
-- positionally with 6 arguments (unchanged, unrelated migration) — plpgsql bodies are not
-- tracked dependencies, so the drop succeeds, and the same 6-arg call re-binds through the two
-- new trailing defaults after the re-create below.
-- ---------------------------------------------------------------------------
drop function finance.record_transaction(uuid,uuid,uuid,text,bigint,date,text,text,text,text);
drop function finance.record_transfer(uuid,uuid,uuid,bigint,date,text,text,text,text);
drop function finance.update_transaction(uuid,uuid,uuid,bigint,date,text);

-- ---------------------------------------------------------------------------
-- finance.record_transaction — re-created with trailing p_subtype (design.md §1b).
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
  p_idempotency_key  text default null,
  p_subtype          text default null)
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
  if not finance.subtype_matches_type(p_kind, p_subtype) then
    raise exception 'subtype % is not valid for a % transaction', p_subtype, p_kind
      using errcode = '22023';
  end if;

  v_signed := case when p_kind = 'income' then abs(p_amount_cents) else -abs(p_amount_cents) end;

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, origin_module, origin_entity_id, idempotency_key, subtype)
  values
    (p_household_id, p_account_id, p_category_id, p_kind, v_signed, p_occurred_on, p_description,
     (select auth.uid()), p_origin_module, p_origin_entity_id, p_idempotency_key, p_subtype)
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
-- finance.record_transfer — re-created with trailing p_subtype, written into BOTH legs so a
-- pair is never half-labeled (design.md §1b).
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
  p_idempotency_key  text default null,
  p_subtype          text default null)
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
  if not finance.subtype_matches_type('transfer', p_subtype) then
    raise exception 'subtype % is not valid for a transfer', p_subtype using errcode = '22023';
  end if;

  v_group_id := gen_random_uuid();

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key,
     subtype)
  values
    (p_household_id, p_from_account_id, null, 'transfer', -abs(p_amount_cents), p_occurred_on,
     p_description, (select auth.uid()), v_group_id, p_origin_module, p_origin_entity_id,
     v_out_key, p_subtype)
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
    -- the other caller's transaction) — resolve the committed group and return it. The first
    -- write already set subtype on both legs, so replay does not need to re-write it.
    select transfer_group_id into v_group_id
      from finance.transactions
     where household_id = p_household_id and origin_module = p_origin_module
       and origin_entity_id = p_origin_entity_id and idempotency_key = v_out_key;
    return v_group_id;
  end if;

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key,
     subtype)
  values
    (p_household_id, p_to_account_id, null, 'transfer', abs(p_amount_cents), p_occurred_on,
     p_description, (select auth.uid()), v_group_id, p_origin_module, p_origin_entity_id,
     v_in_key, p_subtype);

  return v_group_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.update_transaction — re-created with trailing p_subtype + p_clear_subtype
-- (design.md §1b, Decision 3: explicit clear boolean, not a magic sentinel string — `null`
-- keeps its existing "leave unchanged" meaning for every other sibling parameter).
-- ---------------------------------------------------------------------------
create or replace function finance.update_transaction(
  p_transaction_id uuid,
  p_account_id     uuid    default null,   -- null = leave unchanged
  p_category_id    uuid    default null,
  p_amount_cents   bigint  default null,   -- positive magnitude; sign re-derived from type
  p_occurred_on    date    default null,
  p_description    text    default null,
  p_subtype        text    default null,   -- null = leave unchanged (unless p_clear_subtype)
  p_clear_subtype  boolean default false)
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

  if not p_clear_subtype and not finance.subtype_matches_type(v_tx.type, p_subtype) then
    raise exception 'subtype % is not valid for a % transaction', p_subtype, v_tx.type
      using errcode = '22023';
  end if;

  update finance.transactions set
    account_id   = coalesce(p_account_id, account_id),
    category_id  = coalesce(p_category_id, category_id),
    amount_cents = case when p_amount_cents is null then amount_cents
                        when type = 'expense' then -abs(p_amount_cents)
                        else abs(p_amount_cents) end,
    occurred_on  = coalesce(p_occurred_on, occurred_on),
    description  = coalesce(p_description, description),
    subtype      = case when p_clear_subtype then null else coalesce(p_subtype, subtype) end,
    updated_at   = now()
  where id = p_transaction_id;

  return p_transaction_id;
end $$;

-- ---------------------------------------------------------------------------
-- Re-grant EXECUTE on the three new signatures — dropping a function drops its grants. Every
-- other function in this seam is unchanged and keeps its existing grant from
-- 20260804090008_finance_api.sql.
-- ---------------------------------------------------------------------------
grant execute on function
  finance.record_transaction(uuid, uuid, uuid, text, bigint, date, text, text, text, text, text),
  finance.record_transfer(uuid, uuid, uuid, bigint, date, text, text, text, text, text),
  finance.update_transaction(uuid, uuid, uuid, bigint, date, text, text, boolean)
  to authenticated;

notify pgrst, 'reload schema';   -- PostgREST caches function signatures
