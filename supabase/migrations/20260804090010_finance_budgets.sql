-- Finance budgets: opt-in monthly spending limit per expense category, plus the derived
-- current-month progress view. Per design.md §1-§2. Change: finance-budgets (B-001).

-- Opt-in monthly spending limit, one per expense category per space. Configuration only:
-- no spent column, no period column (no rollover/history — see the proposal's deviation note).
create table finance.budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  category_id  uuid not null references finance.categories(id) on delete restrict,
  limit_cents  bigint not null check (limit_cents > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budgets_one_per_category unique (household_id, category_id)
);

-- Cross-table rule Postgres cannot express as a CHECK: the referenced category must be
-- expense-kind and must live in the same space. Mirrors finance.enforce_category_shape().
create or replace function finance.enforce_budget_category()
returns trigger language plpgsql as $$
declare v_category finance.categories;
begin
  select * into v_category from finance.categories where id = new.category_id;
  if not found then
    raise exception 'category not found' using errcode = '22023';
  end if;
  if v_category.household_id <> new.household_id then
    raise exception 'budget must share household with its category' using errcode = '22023';
  end if;
  if v_category.kind <> 'expense' then
    raise exception 'budgets may only be set on expense categories' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger budgets_enforce_category
  before insert or update of category_id, household_id on finance.budgets
  for each row execute function finance.enforce_budget_category();

create trigger budgets_touch_updated_at
  before update on finance.budgets
  for each row execute function core.touch_updated_at();

-- CRITICAL: `security_invoker = true`. Without it the view runs as its OWNER and silently
-- bypasses RLS on finance.budgets and finance.transactions — the Supabase `security_definer_view`
-- data-leak footgun, exactly as called out for account_balances/household_summary. A regular
-- view (never materialized) is required: materialized views do not honor RLS at all.
create view finance.budget_progress with (security_invoker = true) as
select b.id           as budget_id,
       b.household_id,
       b.category_id,
       b.limit_cents,
       -- expense amount_cents are NEGATIVE (signed convention, §3.3 / decision #2);
       -- negate to report spend as a positive magnitude.
       coalesce(sum(-t.amount_cents), 0) as spent_cents
from finance.budgets b
left join finance.transactions t
       on t.household_id = b.household_id
      and t.category_id  = b.category_id
      and t.status       = 'posted'
      and t.type         = 'expense'
      and t.occurred_on >= date_trunc('month', current_date)::date
      and t.occurred_on <  (date_trunc('month', current_date) + interval '1 month')::date
group by b.id;
