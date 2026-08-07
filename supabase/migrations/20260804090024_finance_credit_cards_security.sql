-- RLS + grants for finance.account_credit_card_details / finance.credit_card_status.
-- Per design.md §1a/§1d. Change: finance-credit-card-payments (CC-014).

alter table finance.account_credit_card_details enable row level security;

create policy account_credit_card_details_select on finance.account_credit_card_details
  for select to authenticated
  using (finance.can_read_account(account_id));

create policy account_credit_card_details_insert on finance.account_credit_card_details
  for insert to authenticated
  with check (finance.can_read_account(account_id));

create policy account_credit_card_details_update on finance.account_credit_card_details
  for update to authenticated
  using (finance.can_read_account(account_id))
  with check (finance.can_read_account(account_id));

-- Delete is granted here (unlike finance.categories) because removing terms is a real user
-- action with no history to preserve.
create policy account_credit_card_details_delete on finance.account_credit_card_details
  for delete to authenticated
  using (finance.can_read_account(account_id));

-- migration 6's `alter default privileges in schema finance revoke all on tables from
-- anon, authenticated` means the new table and view arrive with NO grants — these two
-- grant lines are load-bearing, not decoration. The view inherits RLS from its base tables
-- through security_invoker, but still needs its own table-privilege grant.
grant select, insert, update, delete on finance.account_credit_card_details to authenticated;
grant select on finance.credit_card_status to authenticated;
