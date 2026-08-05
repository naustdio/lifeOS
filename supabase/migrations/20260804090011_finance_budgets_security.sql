-- RLS + grants for finance.budgets / finance.budget_progress. Per design.md §3.
-- Change: finance-budgets (B-002).

alter table finance.budgets enable row level security;

create policy budgets_select on finance.budgets
  for select to authenticated
  using (core.is_member(household_id));

create policy budgets_insert on finance.budgets
  for insert to authenticated
  with check (core.is_member(household_id));

create policy budgets_update on finance.budgets
  for update to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

-- Budgets have no dependents, so a hard delete is data-safe (design.md §6, Decision 4) —
-- unlike finance.categories, which is deactivate-only.
create policy budgets_delete on finance.budgets
  for delete to authenticated
  using (core.is_member(household_id));

-- migration 6's `alter default privileges in schema finance revoke all on tables from
-- anon, authenticated` means the new table and view arrive with NO grants — these two
-- grant lines are load-bearing, not decoration. The view needs its own grant:
-- `security_invoker` governs policy evaluation, not table privileges.
grant select, insert, update, delete on finance.budgets to authenticated;
grant select on finance.budget_progress to authenticated;
