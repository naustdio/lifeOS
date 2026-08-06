-- RLS + grants for finance.recurring_transactions / finance.recurring_due. Per design.md §5.
-- Change: finance-recurring (R-002).

alter table finance.recurring_transactions enable row level security;

create policy recurring_transactions_select on finance.recurring_transactions
  for select to authenticated
  using (core.is_member(household_id));

create policy recurring_transactions_insert on finance.recurring_transactions
  for insert to authenticated
  with check (core.is_member(household_id));

-- UPDATE under plain RLS covers edit, pause (active = false) and resume — none of them move
-- money. Only next_due_date advancement TIED TO A POSTING needs the seam (§4).
create policy recurring_transactions_update on finance.recurring_transactions
  for update to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

-- Hard delete is data-safe: the only dependent is transactions.recurring_id, which is
-- `on delete set null`.
create policy recurring_transactions_delete on finance.recurring_transactions
  for delete to authenticated
  using (core.is_member(household_id));

-- migration 6's `alter default privileges in schema finance revoke all on tables from
-- anon, authenticated` means the new table and view arrive with NO grants — both grant
-- lines are load-bearing, not decoration. The view needs its own grant: `security_invoker`
-- governs policy evaluation, not privileges.
grant select, insert, update, delete on finance.recurring_transactions to authenticated;
grant select on finance.recurring_due to authenticated;
