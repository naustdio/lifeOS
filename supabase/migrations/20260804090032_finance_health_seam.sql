-- Finance seam widening for the health-tracking change (design.md Migration Sequence #1).
--
-- (1) Widen `transactions_origin_module_check` to accept 'health', additive only — existing
--     rows all satisfy the wider predicate, so no validation failure is possible. Constraint
--     name re-verified against the live stack (`select conname from pg_constraint where
--     conrelid = 'finance.transactions'::regclass and contype = 'c'`), matching the
--     Postgres-generated name from 20260804090012.
--
-- (2) Close the Finance RLS privacy leak documented in design.md Decision 4: the recurring
--     definitions SELECT/UPDATE/DELETE policies (20260804090013) gate only on
--     `core.is_member(household_id)`, with NO `can_read_account` check — so a chronic-medication
--     definition funded from a PRIVATE account is today visible (and editable/deletable-as-a-
--     no-op-attempt, but readable) to every household member, including through the
--     `security_invoker` `finance.recurring_due` view. This must land BEFORE the health schema
--     (migration 33) because 33's trigger reads `finance.accounts`, and the CHECK above must
--     admit 'health' before any health-origin post is attempted.

alter table finance.transactions drop constraint transactions_origin_module_check;
alter table finance.transactions add  constraint transactions_origin_module_check
  check (origin_module in ('manual','shopping_list','car_control','recurring','health'));

drop policy recurring_transactions_select on finance.recurring_transactions;
create policy recurring_transactions_select on finance.recurring_transactions
  for select to authenticated
  using (core.is_member(household_id) and finance.can_read_account(account_id));

drop policy recurring_transactions_update on finance.recurring_transactions;
create policy recurring_transactions_update on finance.recurring_transactions
  for update to authenticated
  using (core.is_member(household_id) and finance.can_read_account(account_id))
  with check (core.is_member(household_id) and finance.can_read_account(account_id));

drop policy recurring_transactions_delete on finance.recurring_transactions;
create policy recurring_transactions_delete on finance.recurring_transactions
  for delete to authenticated
  using (core.is_member(household_id) and finance.can_read_account(account_id));

-- recurring_transactions_insert is intentionally UNCHANGED: at INSERT time the row does not yet
-- exist to be "read", and `can_read_account` on the target account_id at insert time would just
-- re-derive the same `core.is_member` + private-account-ownership check the account itself
-- already enforces via its own accounts_select policy on the client's account picker. No leak
-- exists on INSERT — only on SELECT/UPDATE/DELETE of an already-created definition.
