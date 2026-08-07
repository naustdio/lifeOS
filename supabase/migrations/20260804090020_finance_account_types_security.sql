-- RLS + explicit SELECT grant for the two new detail tables. Per design.md §1.7. No implicit
-- grant exists (`alter default privileges ... revoke` in 20260804090006:63-64 means new tables
-- get no default grant), so the explicit `grant select` is required or reads silently return
-- zero rows.

alter table finance.account_investment_details enable row level security;
alter table finance.account_loaned_details     enable row level security;

create policy account_investment_details_select on finance.account_investment_details
  for select to authenticated
  using (finance.can_read_account(account_id));

create policy account_loaned_details_select on finance.account_loaned_details
  for select to authenticated
  using (finance.can_read_account(account_id));

grant select on finance.account_investment_details, finance.account_loaned_details to authenticated;
