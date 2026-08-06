-- Grants for finance.month_summary / finance.category_spend. Per design.md §2.
-- Change: finance-dashboard-feed (F-002).
--
-- migration 6's `alter default privileges in schema finance revoke all on tables from
-- anon, authenticated` means both views arrive with NO grants — these lines are
-- load-bearing, not decoration. `security_invoker` governs policy evaluation, not privileges.
-- `anon` remains ungranted.
grant select on finance.month_summary  to authenticated;
grant select on finance.category_spend to authenticated;
