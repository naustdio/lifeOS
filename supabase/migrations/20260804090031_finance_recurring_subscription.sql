-- Boolean subscription marker on a recurring definition (design.md "is_subscription boolean not
-- null default false, no type CHECK", change: finance-subscriptions). Plain boolean only — no
-- provider name, logo, or catalog reference. `not null default false` gives every existing row a
-- valid value with no backfill and no tri-state. Type restriction (subscriptions only make sense
-- for `type = 'expense'`) is enforced client-side (`RecurringForm`/`actions.ts`), not in the DB,
-- keeping this migration trivially reversible.
--
-- `finance.recurring_due` is DELIBERATELY NOT modified: the list badge reads `RecurringListItem`
-- (the base table, via `listRecurringDefinitions`), never the due view, so the view's append-only
-- `create or replace` column-ordering constraint (documented in
-- 20260804090030_finance_installment_recurring.sql §2) is avoided entirely.

alter table finance.recurring_transactions
  add column is_subscription boolean not null default false;
