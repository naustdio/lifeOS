-- Manage an existing account (open, rename, retype, pause, delete). Per design.md
-- "Manage an existing account (open, rename, retype, pause, delete)", Decision 1.
--
-- Three SECURITY DEFINER RPCs, following `finance.create_account()`'s exact pattern
-- (20260804090019_finance_account_types.sql:71-184): `perform core.assert_member(...)`,
-- `language plpgsql security definer set search_path = ''`, `raise ... using errcode`,
-- explicit `grant execute`, trailing `notify pgrst, 'reload schema'`.
--
-- `finance.accounts` keeps SELECT-only RLS — no policy is added by this migration.

-- ---------------------------------------------------------------------------
-- finance.update_account() — rename + retype. Same ~20-param shape as create_account.
-- Relies on the existing `accounts_derive_class` trigger (fires `before update of type`) to
-- re-derive `class`. Deliberately does NOT re-enforce create_account's opening-balance
-- sign-per-type rule on retype (design.md Decision 4 — opening-balance editing is out of scope
-- for this change, and re-enforcing that rule here would dead-end the user with no way to fix it).
-- ---------------------------------------------------------------------------
create function finance.update_account(
  p_account_id             uuid,
  p_household_id           uuid,
  p_name                   text,
  p_type                   text,
  -- liability detail: all five required when p_type = 'liability', all null otherwise
  p_original_amount_cents  bigint default null,
  p_interest_rate_bp       int    default null,
  p_term_months            int    default null,
  p_monthly_payment_cents  bigint default null,
  p_start_date             date   default null,
  -- savings-goal detail: target amount required when p_type = 'savings_goal', null otherwise
  p_target_amount_cents    bigint default null,
  p_target_date            date   default null,
  -- investment detail: cost basis required when p_type = 'investment', all null otherwise
  p_cost_basis_cents       bigint default null,
  p_current_value_cents    bigint default null,
  p_valued_on              date   default null,
  -- loaned detail: counterparty + amount required when p_type = 'loaned', all null otherwise
  p_counterparty_name      text   default null,
  p_loaned_amount_cents    bigint default null,
  p_loaned_term_months     int    default null,
  p_expected_return_date   date   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_has_liab boolean := p_original_amount_cents is not null or p_interest_rate_bp is not null
                     or p_term_months is not null or p_monthly_payment_cents is not null
                     or p_start_date is not null;
  v_has_goal boolean := p_target_amount_cents is not null or p_target_date is not null;
  v_has_inv  boolean := p_cost_basis_cents is not null or p_current_value_cents is not null
                     or p_valued_on is not null;
  v_has_loan boolean := p_counterparty_name is not null or p_loaned_amount_cents is not null
                     or p_loaned_term_months is not null or p_expected_return_date is not null;
begin
  perform core.assert_member(p_household_id);          -- same opener as every other seam function

  if not exists (
    select 1 from finance.accounts
     where id = p_account_id and household_id = p_household_id
  ) then
    raise exception 'account not found in this household' using errcode = 'P0002';
  end if;

  -- detail block must match the type exactly: required when owed, forbidden otherwise
  -- (mirrors finance.create_account()'s validation block verbatim).
  if p_type = 'liability' then
    if p_original_amount_cents is null or p_interest_rate_bp is null or p_term_months is null
       or p_monthly_payment_cents is null or p_start_date is null
       or v_has_goal or v_has_inv or v_has_loan then
      raise exception 'liability accounts require complete loan detail and no goal detail'
        using errcode = '22023';
    end if;
  elsif p_type = 'savings_goal' then
    if p_target_amount_cents is null or v_has_liab or v_has_inv or v_has_loan then
      raise exception 'savings-goal accounts require a target amount and no loan detail'
        using errcode = '22023';
    end if;
  elsif p_type = 'investment' then
    if p_cost_basis_cents is null or v_has_liab or v_has_goal or v_has_loan then
      raise exception 'investment accounts require a cost basis and no other detail'
        using errcode = '22023';
    end if;
  elsif p_type = 'loaned' then
    if p_counterparty_name is null or btrim(p_counterparty_name) = ''
       or p_loaned_amount_cents is null or v_has_liab or v_has_goal or v_has_inv then
      raise exception 'loaned accounts require a counterparty and amount, and no other detail'
        using errcode = '22023';
    end if;
  elsif v_has_liab or v_has_goal or v_has_inv or v_has_loan then
    raise exception 'detail fields are not applicable to this account type' using errcode = '22023';
  end if;

  update finance.accounts
     set name = btrim(p_name),
         type = p_type                 -- `accounts_derive_class` trigger re-derives `class`
   where id = p_account_id and household_id = p_household_id;

  -- Swap detail rows: delete every exclusive detail row for this account (outgoing type's row,
  -- whichever table it lived in), then insert the incoming type's row. At most one of the four
  -- deletes below actually removes a row; the other three are no-ops.
  delete from finance.account_liability_details   where account_id = p_account_id;
  delete from finance.account_goal_details         where account_id = p_account_id;
  delete from finance.account_investment_details   where account_id = p_account_id;
  delete from finance.account_loaned_details        where account_id = p_account_id;

  -- WARNING-1 fix (sdd-verify finance-account-edit): design.md Decision 1 states
  -- account_credit_card_details must ALSO be deleted here when leaving credit_card — it lives
  -- under a separate plain-RLS exception (design.md Decision 2), not one of the four exclusive
  -- detail tables above, but is still exclusive to credit_card and must not survive a retype
  -- away from it (it would otherwise silently resurrect stale terms on a later retype back).
  if p_type <> 'credit_card' then
    delete from finance.account_credit_card_details where account_id = p_account_id;
  end if;

  if p_type = 'liability' then
    insert into finance.account_liability_details
      (account_id, original_amount_cents, interest_rate_bp, term_months,
       monthly_payment_cents, start_date)
    values (p_account_id, p_original_amount_cents, p_interest_rate_bp, p_term_months,
            p_monthly_payment_cents, p_start_date);
  elsif p_type = 'savings_goal' then
    insert into finance.account_goal_details (account_id, target_amount_cents, target_date)
    values (p_account_id, p_target_amount_cents, p_target_date);
  elsif p_type = 'investment' then
    insert into finance.account_investment_details
      (account_id, cost_basis_cents, current_value_cents, valued_on)
    values (p_account_id, p_cost_basis_cents,
            coalesce(p_current_value_cents, p_cost_basis_cents),
            coalesce(p_valued_on, current_date));
  elsif p_type = 'loaned' then
    insert into finance.account_loaned_details
      (account_id, counterparty_name, original_amount_cents, term_months, expected_return_date)
    values (p_account_id, btrim(p_counterparty_name), p_loaned_amount_cents,
            p_loaned_term_months, p_expected_return_date);
  end if;

  return p_account_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.set_account_archived() — reversible pause/resume. Simple boolean toggle on
-- `archived_at`, mirroring `setRecurringActive`'s pattern (recurring-repository.ts:264-284).
-- ---------------------------------------------------------------------------
create function finance.set_account_archived(
  p_account_id  uuid,
  p_household_id uuid,
  p_archived    boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform core.assert_member(p_household_id);

  if not exists (
    select 1 from finance.accounts
     where id = p_account_id and household_id = p_household_id
  ) then
    raise exception 'account not found in this household' using errcode = 'P0002';
  end if;

  update finance.accounts
     set archived_at = case when p_archived then now() else null end
   where id = p_account_id and household_id = p_household_id;
end $$;

-- ---------------------------------------------------------------------------
-- finance.delete_account() — hard delete, refused when the account has any transaction or
-- recurring/installment history (design.md Decision 5). Detail rows cascade via
-- `on delete cascade` on their FK to `finance.accounts(id)`.
-- ---------------------------------------------------------------------------
create function finance.delete_account(
  p_account_id   uuid,
  p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform core.assert_member(p_household_id);

  if not exists (
    select 1 from finance.accounts
     where id = p_account_id and household_id = p_household_id
  ) then
    raise exception 'account not found in this household' using errcode = 'P0002';
  end if;

  if exists (select 1 from finance.transactions where account_id = p_account_id)
     or exists (select 1 from finance.recurring_transactions
                 where account_id = p_account_id or to_account_id = p_account_id) then
    raise exception 'account has history and cannot be deleted' using errcode = '2BP01';
  end if;

  delete from finance.accounts where id = p_account_id and household_id = p_household_id;
end $$;

-- ---------------------------------------------------------------------------
-- Grants — matching signatures exactly (the classic failure mode for this kind of migration,
-- per design.md). Missing/mismatched grants make every call fail with "permission denied".
-- ---------------------------------------------------------------------------
grant execute on function
  finance.update_account(uuid, uuid, text, text, bigint, int, int, bigint, date,
                         bigint, date, bigint, bigint, date, text, bigint, int, date),
  finance.set_account_archived(uuid, uuid, boolean),
  finance.delete_account(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
