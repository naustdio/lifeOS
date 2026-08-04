-- finance.can_read_account() + RLS policies on finance.* + grant scaffolding.
-- Per design.md §4.1, §4.2, §5.5. Sub-slice 2A.

create or replace function finance.can_read_account(p_account_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from finance.accounts a
     where a.id = p_account_id
       and core.is_member(a.household_id)
       and (a.visibility = 'household' or a.owner_user_id = (select auth.uid())));
$$;

alter table finance.accounts                  enable row level security;
alter table finance.account_liability_details  enable row level security;
alter table finance.account_goal_details       enable row level security;
alter table finance.category_templates         enable row level security;
alter table finance.categories                 enable row level security;
alter table finance.transactions               enable row level security;

-- finance.accounts — SELECT only; writes are seam-only (finance.create_account()).
create policy accounts_select on finance.accounts
  for select to authenticated
  using (core.is_member(household_id) and (visibility = 'household' or owner_user_id = (select auth.uid())));

-- finance.account_*_details — readable through the same visibility rule as the parent account.
create policy account_liability_details_select on finance.account_liability_details
  for select to authenticated
  using (finance.can_read_account(account_id));

create policy account_goal_details_select on finance.account_goal_details
  for select to authenticated
  using (finance.can_read_account(account_id));

-- finance.category_templates — no policy at all for `authenticated`: catalog is read only by
-- definer functions (finance.ensure_default_categories), which bypass RLS.

-- finance.categories — SELECT + INSERT + UPDATE. No DELETE — deactivate via archived_at.
create policy categories_select on finance.categories
  for select to authenticated
  using (core.is_member(household_id));

create policy categories_insert on finance.categories
  for insert to authenticated
  with check (core.is_member(household_id));

create policy categories_update on finance.categories
  for update to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

-- finance.transactions — SELECT only; writes are seam-only. No DELETE, ever.
create policy transactions_select on finance.transactions
  for select to authenticated
  using (core.is_member(household_id) and finance.can_read_account(account_id));

-- ---------------------------------------------------------------------------
-- Grant revocation + explicit re-grants (design.md §5.5). The seam-function EXECUTE
-- grants themselves land in the finance_api.sql migration alongside the functions.
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema finance from anon, authenticated;
revoke all on all functions in schema finance from anon, authenticated;
alter default privileges in schema finance revoke all on tables    from anon, authenticated;
alter default privileges in schema finance revoke all on functions from anon, authenticated;

grant usage on schema finance to authenticated;
grant select on finance.accounts, finance.account_liability_details, finance.account_goal_details,
                finance.categories, finance.transactions,
                finance.account_balances, finance.household_summary
      to authenticated;                                   -- reads only, still RLS-filtered
grant insert, update on finance.categories to authenticated;  -- the one user-owned table; no DELETE
-- finance.category_templates: no grant at all. Definer functions read it; users never touch it.
