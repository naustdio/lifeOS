-- Household-level budget settings: a custom period reset day (instead of always the calendar
-- month), an overall monthly total budget (separate from per-category limits), and an opt-in
-- toggle to count not-yet-posted recurring EXPENSE occurrences as already spent for the period.
-- One row per household, created lazily on first write (no row = defaults: reset_day=1 i.e.
-- calendar month, no total budget, scheduled amounts excluded) so every existing household needs
-- zero backfill and `finance.budget_progress`'s window is byte-identical to before this migration
-- for any household that never opens the settings panel.

create table finance.budget_settings (
  household_id              uuid primary key references core.households(id) on delete cascade,
  reset_day                 int not null default 1 check (reset_day between 1 and 31),
  monthly_total_cents       bigint check (monthly_total_cents > 0),
  include_scheduled_as_spent boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger budget_settings_touch_updated_at
  before update on finance.budget_settings
  for each row execute function core.touch_updated_at();

alter table finance.budget_settings enable row level security;

create policy budget_settings_select on finance.budget_settings
  for select using (core.is_member(household_id));
create policy budget_settings_insert on finance.budget_settings
  for insert with check (core.is_member(household_id));
create policy budget_settings_update on finance.budget_settings
  for update using (core.is_member(household_id)) with check (core.is_member(household_id));

grant select, insert, update on finance.budget_settings to authenticated;

-- The Nth (clamped to the last real day of that month) day of the given year/month — the same
-- "clamp, then let later months drift" rule `finance.advance_due_date()` already establishes for
-- recurring cursors, reused here so a reset_day of 31 behaves sensibly in a 30-day month.
create or replace function finance.clamped_day_of_month(p_year int, p_month int, p_day int)
returns date language sql immutable set search_path = '' as $$
  select make_date(
    p_year, p_month,
    least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int)
  );
$$;

-- The [period_start, period_end) window containing `p_as_of`, per the household's reset_day
-- (default 1 when no settings row exists — identical to the pre-this-migration calendar-month
-- window). Both bounds are computed fresh from year/month/day rather than by adding an interval
-- to period_start, specifically to avoid Postgres's date+interval overflow behavior (e.g. Jan 31
-- + 1 month = Mar 3, not clamped) silently shifting the period boundary.
create or replace function finance.budget_period_bounds(p_household_id uuid, p_as_of date default current_date)
returns table(period_start date, period_end date)
language sql stable set search_path = '' as $$
  with rd as (
    select coalesce(
      (select s.reset_day from finance.budget_settings s where s.household_id = p_household_id), 1
    ) as reset_day
  ),
  this_reset as (
    select finance.clamped_day_of_month(
      extract(year from p_as_of)::int, extract(month from p_as_of)::int, (select reset_day from rd)
    ) as d
  )
  select
    case when p_as_of >= (select d from this_reset) then (select d from this_reset)
      else finance.clamped_day_of_month(
        extract(year from (p_as_of - interval '1 month'))::int,
        extract(month from (p_as_of - interval '1 month'))::int,
        (select reset_day from rd))
    end as period_start,
    case when p_as_of >= (select d from this_reset)
      then finance.clamped_day_of_month(
        extract(year from (p_as_of + interval '1 month'))::int,
        extract(month from (p_as_of + interval '1 month'))::int,
        (select reset_day from rd))
      else (select d from this_reset)
    end as period_end;
$$;

-- `budget_progress` widened: the window is now `finance.budget_period_bounds()` instead of a
-- hardcoded calendar-month, and `spent_cents` optionally folds in not-yet-posted recurring
-- EXPENSE occurrences due within the period (per `include_scheduled_as_spent`) — a recurring
-- definition's `next_due_date` only ever reflects an UNCONFIRMED occurrence (confirming advances
-- the cursor past it), so this is exactly "scheduled but not yet spent," with no double-counting
-- risk against already-posted transactions.
create or replace view finance.budget_progress with (security_invoker = true) as
select b.id           as budget_id,
       b.household_id,
       b.category_id,
       b.limit_cents,
       coalesce(sum(-t.amount_cents), 0)
         + case when coalesce(s.include_scheduled_as_spent, false) then coalesce((
             select sum(r.amount_cents) from finance.recurring_transactions r
              where r.household_id = b.household_id
                and r.category_id  = b.category_id
                and r.type = 'expense'
                and r.active
                and r.next_due_date >= bounds.period_start
                and r.next_due_date <  bounds.period_end
           ), 0) else 0 end as spent_cents
from finance.budgets b
cross join lateral finance.budget_period_bounds(b.household_id) bounds
left join finance.budget_settings s on s.household_id = b.household_id
left join finance.transactions t
       on t.household_id = b.household_id
      and t.category_id  = b.category_id
      and t.status       = 'posted'
      and t.type         = 'expense'
      and t.occurred_on >= bounds.period_start
      and t.occurred_on <  bounds.period_end
group by b.id, s.include_scheduled_as_spent, bounds.period_start, bounds.period_end;

-- Overall monthly total (separate from per-category limits): total spend across EVERY expense
-- category in the period, vs. the household's configured `monthly_total_cents`. One row per
-- household that has a settings row with a non-null total configured.
create view finance.budget_total_progress with (security_invoker = true) as
select s.household_id,
       s.monthly_total_cents,
       coalesce(sum(-t.amount_cents), 0)
         + case when s.include_scheduled_as_spent then coalesce((
             select sum(r.amount_cents) from finance.recurring_transactions r
              where r.household_id = s.household_id
                and r.type = 'expense'
                and r.active
                and r.next_due_date >= bounds.period_start
                and r.next_due_date <  bounds.period_end
           ), 0) else 0 end as spent_cents,
       bounds.period_start,
       bounds.period_end
from finance.budget_settings s
cross join lateral finance.budget_period_bounds(s.household_id) bounds
left join finance.transactions t
       on t.household_id = s.household_id
      and t.status       = 'posted'
      and t.type         = 'expense'
      and t.occurred_on >= bounds.period_start
      and t.occurred_on <  bounds.period_end
where s.monthly_total_cents is not null
group by s.household_id, s.monthly_total_cents, s.include_scheduled_as_spent, bounds.period_start, bounds.period_end;

grant select on finance.budget_total_progress to authenticated;
