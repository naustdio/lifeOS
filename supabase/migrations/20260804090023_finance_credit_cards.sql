-- Optional credit card terms + derived read surface. Per design.md §1a/§1c/§1d.
-- Change: finance-credit-card-payments (CC-013).
--
-- RENUMBERING NOTE (matches the precedent set by finance-account-types-expansion and this
-- change's own Slice A): design.md's literal filenames (...018/...019) collided with three
-- sibling UNMERGED branches already occupying those version numbers on the shared local
-- Supabase dev stack (finance-transaction-subtypes ...018, finance-account-types-expansion
-- ...019/...020). Slice A of THIS change already claimed ...021/...022. Confirmed ...023/...024
-- are free via both `git log --all -- supabase/migrations` and the live
-- `supabase_migrations.schema_migrations` table before writing this file.
--
-- Deliberately independent of finance.create_account()'s 13-parameter signature (design.md
-- Decision 2): card terms guard no balance invariant, so they live under the same documented
-- plain-RLS exception as finance.categories / finance.budgets, not through the seam. This makes
-- account creation with card terms a NON-ATOMIC two-step client flow — accepted tradeoff, not a
-- bug (see AccountForm.tsx in Slice C).

-- §1a. Optional card terms. 1:1, cascade-deleted with the account, gated to credit_card accounts.
-- Every column except account_id is nullable: a card may carry a limit with no due day, or vice
-- versa. Absence of the whole row is the normal state for every existing card — no backfill.
create table finance.account_credit_card_details (
  account_id           uuid primary key references finance.accounts(id) on delete cascade,
  credit_limit_cents   bigint check (credit_limit_cents is null or credit_limit_cents > 0),
  statement_day        int    check (statement_day between 1 and 31),
  due_day              int    check (due_day between 1 and 31),
  min_payment_cents    bigint check (min_payment_cents is null or min_payment_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger account_credit_card_details_touch_updated_at
  before update on finance.account_credit_card_details
  for each row execute function core.touch_updated_at();

-- Type gate as a trigger, not a CHECK: a CHECK cannot reference finance.accounts.
-- Same reasoning as finance.enforce_category_shape() / finance.enforce_budget_category().
create or replace function finance.enforce_card_detail_account_type()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from finance.accounts a
                  where a.id = new.account_id and a.type = 'credit_card') then
    raise exception 'card terms apply only to credit_card accounts' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger account_credit_card_details_type_gate
  before insert or update of account_id on finance.account_credit_card_details
  for each row execute function finance.enforce_card_detail_account_type();

-- §1c. Due-date derivation. Clamp is the whole point: due_day 31 in February is the 28th/29th.
create or replace function finance.clamp_day_to_month(p_day int, p_month_start date)
returns date language sql immutable as $$
  select p_month_start + (least(p_day,
    extract(day from (p_month_start + interval '1 month - 1 day'))::int) - 1);
$$;

create or replace function finance.next_card_due_date(p_due_day int, p_from date)
returns date language sql immutable as $$
  select case
    when p_due_day is null then null
    when finance.clamp_day_to_month(p_due_day, date_trunc('month', p_from)::date) >= p_from
      then finance.clamp_day_to_month(p_due_day, date_trunc('month', p_from)::date)
    else finance.clamp_day_to_month(p_due_day,
           (date_trunc('month', p_from) + interval '1 month')::date)
  end;
$$;

-- §1d. The read surface. security_invoker = true — 4th occurrence of the project's hard rule
-- (account_balances, household_summary, budget_progress, this view). Every derived column is
-- NULL-safe when the detail row is absent — has_terms = false is the empty state the UI
-- renders, never NaN.
create view finance.credit_card_status with (security_invoker = true) as
select a.id as account_id, a.household_id, a.name,
       b.balance_cents,
       -b.balance_cents                                     as owed_cents,   -- liability sign flip
       d.credit_limit_cents, d.statement_day, d.due_day, d.min_payment_cents,
       finance.next_card_due_date(d.due_day, current_date)  as next_due_date,
       (finance.next_card_due_date(d.due_day, current_date) - current_date) as days_until_due,
       case when d.credit_limit_cents is null or d.credit_limit_cents = 0 then null
            else ((-b.balance_cents) * 10000 / d.credit_limit_cents)::int end as utilization_bp,
       (d.credit_limit_cents is not null and -b.balance_cents > d.credit_limit_cents) as over_limit,
       (d.account_id is not null)                           as has_terms
from finance.accounts a
join finance.account_balances b on b.account_id = a.id
left join finance.account_credit_card_details d on d.account_id = a.id
where a.type = 'credit_card' and a.archived_at is null;

-- ---------------------------------------------------------------------------
-- Gap closure (discovered during Slice B, not called out in design.md): Slice A's
-- 20260804090021_finance_recurring_transfer_shape.sql added `type`/`to_account_id` to
-- `finance.recurring_transactions`, but `finance.recurring_due` (defined in the earlier
-- 20260804090012_finance_recurring.sql) still projects only the pre-Slice-A column list.
-- tasks.md CC-020 requires `recurring-repository.ts` to read `type`/`to_account_id` off this
-- view. `create or replace view` can only APPEND columns at the end of the output list (cannot
-- reorder/insert), so both new columns land after `days_overdue`, not beside their logical
-- neighbors. Same `security_invoker = true` carries over unchanged (`create or replace view`
-- preserves prior view options unless respecified — the view already has this option set).
-- ---------------------------------------------------------------------------
create or replace view finance.recurring_due with (security_invoker = true) as
select r.id as recurring_id,
       r.household_id,
       r.account_id,
       r.category_id,
       r.amount_cents,
       r.description,
       r.frequency,
       r.next_due_date,
       (current_date - r.next_due_date) as days_overdue,   -- 0 on the due date itself
       r.type,
       r.to_account_id
from finance.recurring_transactions r
where r.active
  and r.next_due_date <= current_date;
