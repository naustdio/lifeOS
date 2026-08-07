-- Widen finance.accounts.type from six to eight literals: `investment` (an asset the household
-- owns whose value fluctuates) and `loaned` (a receivable — money owed TO the household). Both
-- derive class = 'asset' through the unchanged trigger mechanism. Per design.md §1.
--
-- Numbering note: `...018` is taken by the (separately-branched, unmerged) `finance-transaction-
-- subtypes` change on `feat/finance-transaction-subtypes`; this change uses `...019`/`...020` to
-- avoid a filename collision. Both changes branch independently from `main`.

-- ---------------------------------------------------------------------------
-- 1.1 Type CHECK — constraint name confirmed against the local stack:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'finance.accounts'::regclass and contype = 'c';
-- returned `accounts_type_check`, exactly as expected — matching the precedent set in
-- `20260804090012_finance_recurring.sql:46-53`.
-- ---------------------------------------------------------------------------
alter table finance.accounts drop constraint accounts_type_check;
alter table finance.accounts add  constraint accounts_type_check
  check (type in ('cash','checking','credit_card','savings','liability','savings_goal',
                  'investment','loaned'));

-- ---------------------------------------------------------------------------
-- 1.2 Detail tables — mirror account_liability_details/account_goal_details exactly:
-- same account_id PK, same on delete cascade, same "written only by the definer seam" rule.
-- ---------------------------------------------------------------------------
create table finance.account_investment_details (
  account_id           uuid primary key references finance.accounts(id) on delete cascade,
  cost_basis_cents     bigint not null check (cost_basis_cents >= 0),
  current_value_cents  bigint not null check (current_value_cents >= 0),
  valued_on            date   not null default current_date
);

create table finance.account_loaned_details (
  account_id             uuid primary key references finance.accounts(id) on delete cascade,
  counterparty_name      text   not null check (length(btrim(counterparty_name)) between 1 and 60),
  original_amount_cents  bigint not null check (original_amount_cents > 0),
  term_months            int    check (term_months > 0),          -- optional, no interest column
  expected_return_date   date                                     -- optional
);

-- ---------------------------------------------------------------------------
-- 1.3 derive_account_class() — site (a). Only change: add both literals to the asset branch.
-- The `else raise 'unknown account type'` arm stays untouched — the failure that fires if this
-- site were missed, and it must keep firing for a genuinely unknown type.
-- ---------------------------------------------------------------------------
create or replace function finance.derive_account_class()
returns trigger language plpgsql as $$
begin
  if new.type in ('cash', 'checking', 'savings', 'savings_goal', 'investment', 'loaned') then
    new.class := 'asset';
  elsif new.type in ('credit_card', 'liability') then
    new.class := 'liability';
  else
    raise exception 'unknown account type: %', new.type using errcode = '22023';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1.4 create_account() — site (b). DROP + CREATE (mandatory, not `create or replace`): the
-- argument list changes, and `create or replace` with a different signature would produce a
-- SECOND overload rather than replace this one, which then breaks PostgREST's named-argument
-- RPC resolution ("could not choose the best candidate function").
--
-- DROP at the exact live 13-parameter signature confirmed via `\df finance.create_account`
-- before writing this migration.
-- ---------------------------------------------------------------------------
drop function finance.create_account(uuid, text, text, bigint, text, int,
                                     bigint, int, int, bigint, date, bigint, date);

create function finance.create_account(
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
  p_target_date           date   default null,
  -- investment detail: cost basis required when p_type = 'investment', all null otherwise
  p_cost_basis_cents      bigint default null,
  p_current_value_cents   bigint default null,
  p_valued_on             date   default null,
  -- loaned detail: counterparty + amount required when p_type = 'loaned', all null otherwise.
  -- Dedicated params (not reused from liability's p_original_amount_cents/p_term_months) so the
  -- mutually-exclusive v_has_* flags stay mechanical and a mis-shaped submit cannot be silently
  -- accepted by the wrong branch (design.md Decision 2).
  p_counterparty_name     text   default null,
  p_loaned_amount_cents   bigint default null,
  p_loaned_term_months    int    default null,
  p_expected_return_date  date   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user       uuid := (select auth.uid());
  v_account_id uuid;
  v_has_liab   boolean := p_original_amount_cents is not null or p_interest_rate_bp is not null
                       or p_term_months is not null or p_monthly_payment_cents is not null
                       or p_start_date is not null;
  v_has_goal   boolean := p_target_amount_cents is not null or p_target_date is not null;
  v_has_inv    boolean := p_cost_basis_cents is not null or p_current_value_cents is not null
                       or p_valued_on is not null;
  v_has_loan   boolean := p_counterparty_name is not null or p_loaned_amount_cents is not null
                       or p_loaned_term_months is not null or p_expected_return_date is not null;
begin
  perform core.assert_member(p_household_id);          -- same opener as every other seam function

  -- detail block must match the type exactly: required when owed, forbidden otherwise
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

  -- liability balances are negative principal walking toward zero (§3.3)
  if p_type in ('credit_card','liability') and p_opening_balance_cents > 0 then
    raise exception 'a liability opening balance is zero or negative' using errcode = '22023';
  end if;

  -- a receivable is money owed TO the household: the exact inverse of the liability rule above.
  -- MUST stay a separate statement, never appended to the `in (...)` list above — the two rules
  -- are exact opposites, and reusing the liability list would silently invert household net worth
  -- (design.md Decision 1, the highest-impact failure mode in this change).
  if p_type = 'loaned' and p_opening_balance_cents < 0 then
    raise exception 'a loaned opening balance is zero or positive' using errcode = '22023';
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
  elsif p_type = 'investment' then
    insert into finance.account_investment_details
      (account_id, cost_basis_cents, current_value_cents, valued_on)
    values (v_account_id, p_cost_basis_cents,
            coalesce(p_current_value_cents, p_cost_basis_cents),
            coalesce(p_valued_on, current_date));
  elsif p_type = 'loaned' then
    insert into finance.account_loaned_details
      (account_id, counterparty_name, original_amount_cents, term_months, expected_return_date)
    values (v_account_id, btrim(p_counterparty_name), p_loaned_amount_cents,
            p_loaned_term_months, p_expected_return_date);
  end if;

  return v_account_id;
end $$;

-- ---------------------------------------------------------------------------
-- 1.5 update_investment_value() — new seam. Display-only: writes NO transaction (proposal Q1
-- assumption — an unrealized valuation is not income, design.md Decision 8).
-- ---------------------------------------------------------------------------
create function finance.update_investment_value(
  p_household_id        uuid,
  p_account_id           uuid,
  p_current_value_cents  bigint,
  p_valued_on            date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  perform core.assert_member(p_household_id);

  select type into v_type from finance.accounts
   where id = p_account_id and household_id = p_household_id;

  if v_type is null then
    raise exception 'account not found in this household' using errcode = '22023';
  end if;
  if v_type <> 'investment' then
    raise exception 'only investment accounts can have their current value updated'
      using errcode = '22023';
  end if;
  if p_current_value_cents < 0 then
    raise exception 'current value cannot be negative' using errcode = '22023';
  end if;

  update finance.account_investment_details
     set current_value_cents = p_current_value_cents,
         valued_on            = coalesce(p_valued_on, current_date)
   where account_id = p_account_id;
end $$;

-- ---------------------------------------------------------------------------
-- 1.6 Grants — site (b), second half. create_account's entry rewritten to the 20-argument
-- signature; update_investment_value appended. Missing this makes every account creation fail
-- with "permission denied for function create_account" — the single most likely
-- "it worked locally last week" regression in this change.
-- ---------------------------------------------------------------------------
grant execute on function
  finance.create_account(uuid, text, text, bigint, text, int, bigint, int, int, bigint, date,
                         bigint, date, bigint, bigint, date, text, bigint, int, date),
  finance.update_investment_value(uuid, uuid, bigint, date)
  to authenticated;

notify pgrst, 'reload schema';
