-- Recurring INCOME support: widens `finance.recurring_transactions.type` from
-- ('expense','transfer') to ('expense','transfer','income'). Structurally identical to the
-- existing expense shape (requires category_id, forbids to_account_id) — an income definition is
-- a mirror of an expense definition with the opposite posted sign.
--
-- Product motivation: the finance-calendar-projection change originally shipped
-- expense-outflows-only because no recurring-income concept existed, explicitly labeled
-- "projected outflows, never a full balance forecast" to avoid misleading users. The product
-- owner has since confirmed the calendar should show a real running balance (salary/income
-- included), so this migration is the prerequisite: it lets a household model recurring income
-- (e.g. monthly salary) the same way it already models recurring expenses.
--
-- Confirmed via `select conname from pg_constraint where conrelid =
-- 'finance.recurring_transactions'::regclass` before writing this migration: `recurring_expense_shape`
-- is a CHECK named exactly that (not auto-generated), so it can be dropped and redefined by name
-- without introspection guesswork; `recurring_transfer_shape` is untouched.

alter table finance.recurring_transactions
  drop constraint recurring_expense_shape;

alter table finance.recurring_transactions
  drop constraint recurring_transactions_type_check;

alter table finance.recurring_transactions
  add constraint recurring_transactions_type_check check (type in ('expense', 'transfer', 'income')),
  add constraint recurring_expense_or_income_shape check (
    type not in ('expense', 'income') or (category_id is not null and to_account_id is null));
