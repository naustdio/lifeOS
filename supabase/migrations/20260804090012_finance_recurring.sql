-- Finance recurring: `finance.recurring_transactions` (definition + single next-due-date
-- cursor), the two `finance.transactions` ALTERs (recurring_id FK + widened origin_module
-- CHECK), `finance.advance_due_date()`, and the `finance.recurring_due` view.
-- Per design.md §1-§3. Change: finance-recurring (R-001).

-- ---------------------------------------------------------------------------
-- §1. finance.recurring_transactions
-- ---------------------------------------------------------------------------

-- A recurring expense DEFINITION plus its single due-date cursor. Never an occurrence log:
-- one row per definition, forever. `next_due_date` is the only mutable schedule state.
create table finance.recurring_transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  account_id   uuid not null references finance.accounts(id)   on delete restrict,
  category_id  uuid not null references finance.categories(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),   -- POSITIVE magnitude, see below
  description  text not null default '' check (length(description) <= 200),
  frequency    text not null check (frequency in ('monthly','weekly','biweekly','yearly')),
  next_due_date date not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Serves BOTH reads: the definition list (`where household_id = $1`, leading column) and the
-- due/banner query (`where household_id = $1 and active and next_due_date <= current_date`).
create index on finance.recurring_transactions (household_id, next_due_date) where active;

create trigger recurring_transactions_touch_updated_at
  before update on finance.recurring_transactions
  for each row execute function core.touch_updated_at();

-- ---------------------------------------------------------------------------
-- §2. finance.transactions — the two ALTERs
-- ---------------------------------------------------------------------------

-- `recurring_id` already ships as an unconstrained nullable uuid ("reserved column, unused this
-- cycle", 20260804090005_finance_schema.sql:177). This change gives it its purpose; it is
-- CONSTRAINED, not created. `on delete set null` matches how a deleted definition must behave:
-- already-posted transactions keep their history and simply lose the back-reference.
alter table finance.transactions
  add constraint transactions_recurring_id_fkey
  foreign key (recurring_id) references finance.recurring_transactions(id) on delete set null;

-- Widen the origin domain by exactly one additive value. The constraint name was confirmed
-- against the local stack (`select conname from pg_constraint where conrelid =
-- 'finance.transactions'::regclass and contype = 'c'`) to be the expected Postgres-generated
-- name for the inline CHECK on `origin_module`: `transactions_origin_module_check`.
-- Existing rows all satisfy the wider predicate, so no validation failure is possible.
alter table finance.transactions drop constraint transactions_origin_module_check;
alter table finance.transactions add  constraint transactions_origin_module_check
  check (origin_module in ('manual','shopping_list','car_control','recurring'));

-- ---------------------------------------------------------------------------
-- §3. finance.advance_due_date() + finance.recurring_due
-- ---------------------------------------------------------------------------

-- Single source of schedule truth on the SQL side; called by BOTH seam functions so confirm and
-- discard can never drift. Plain (invoker) immutable sql — no `security definer`, therefore no
-- `set search_path = ''` (that pairing is required only for definer functions); the body is
-- fully schema-qualified-free (built-ins only) and depends on no table.
create or replace function finance.advance_due_date(p_date date, p_frequency text)
returns date language sql immutable as $$
  select (p_date + case p_frequency
                     when 'monthly'  then interval '1 month'
                     when 'weekly'   then interval '7 days'
                     when 'biweekly' then interval '15 days'   -- exactly 15 days, NOT "2 weeks"
                     when 'yearly'   then interval '1 year'
                   end)::date;
$$;

-- CRITICAL: `security_invoker = true`. Without it the view runs as its OWNER and silently
-- bypasses RLS on finance.recurring_transactions — the Supabase `security_definer_view`
-- data-leak footgun. This is the THIRD occurrence of this exact footgun in this repo
-- (account_balances/household_summary, budget_progress, now this): it is a HARD PROJECT
-- CONVENTION, not a choice. A regular view is required; materialized views do not honor RLS.
create view finance.recurring_due with (security_invoker = true) as
select r.id as recurring_id,
       r.household_id,
       r.account_id,
       r.category_id,
       r.amount_cents,
       r.description,
       r.frequency,
       r.next_due_date,
       (current_date - r.next_due_date) as days_overdue   -- 0 on the due date itself
from finance.recurring_transactions r
where r.active
  and r.next_due_date <= current_date;
