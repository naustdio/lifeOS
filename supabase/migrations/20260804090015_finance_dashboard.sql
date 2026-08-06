-- Finance dashboard feed: current-calendar-month aggregation views for Home's month
-- summary and spending-by-category cards. Per design.md §2. Change: finance-dashboard-feed
-- (F-001). Read-only — no table, column, or write path is added.

-- Current-calendar-month income/expense totals for the dashboard "Este mes" card.
-- CRITICAL: `security_invoker = true` — without it this view runs as its OWNER and silently
-- bypasses RLS on finance.transactions (Supabase linter: `security_definer_view`). Fifth
-- occurrence of this footgun in this repo; it is a hard convention. Regular view only —
-- materialized views do not honor RLS.
create view finance.month_summary with (security_invoker = true) as
select t.household_id,
       -- income amount_cents are POSITIVE, expense amount_cents are NEGATIVE (signed
       -- convention, …0005 `tx_sign_matches_type`); negate expenses to report spend as a
       -- positive magnitude, exactly as budget_progress.spent_cents does.
       coalesce(sum( t.amount_cents) filter (where t.type = 'income'),  0) as income_cents,
       coalesce(sum(-t.amount_cents) filter (where t.type = 'expense'), 0) as expense_cents
from finance.transactions t
where t.status = 'posted'
  and t.type  <> 'transfer'
  and t.occurred_on >= date_trunc('month', current_date)::date
  and t.occurred_on <  (date_trunc('month', current_date) + interval '1 month')::date
group by t.household_id;

-- Current-calendar-month expense total per category, for the ranked CSS bar list.
-- `security_invoker = true` for the same reason; it also makes the categories join obey
-- the categories SELECT policy rather than the view owner's privileges.
create view finance.category_spend with (security_invoker = true) as
select t.household_id,
       t.category_id,
       c.name as category_name,
       coalesce(sum(-t.amount_cents), 0) as spent_cents
from finance.transactions t
join finance.categories c on c.id = t.category_id
where t.status = 'posted'
  and t.type   = 'expense'          -- excludes 'transfer' AND 'income' in one predicate
  and t.occurred_on >= date_trunc('month', current_date)::date
  and t.occurred_on <  (date_trunc('month', current_date) + interval '1 month')::date
group by t.household_id, t.category_id, c.name;
