-- Recurring transfer shape: a `type` discriminator on finance.recurring_transactions plus the
-- two shape CHECKs that mirror tx_category_required / tx_transfer_has_no_category on
-- finance.transactions. Per design.md §1b. Change: finance-credit-card-payments (CC-001).
--
-- Renumbered from the design's planned `...018` to `...021` — `...017`..`...020` are already
-- occupied by sibling unmerged branches applied to this shared local stack
-- (finance-categories-icon-color, finance-transaction-subtypes, finance-account-types-expansion),
-- the same renumbering precedent set by finance-account-types-expansion itself. Confirmed via
-- `select version from supabase_migrations.schema_migrations` before writing this file.
--
-- Split into its own file (distinct from the confirm() rewrite in ...022) so Slice A's DDL and
-- its RPC rewrite land as two independently reviewable, independently revertible units, and so
-- Slice A never carries card-table DDL (that belongs to Slice B).

-- Confirmed via `select conname from pg_constraint where conrelid =
-- 'finance.recurring_transactions'::regclass` before writing this migration: no existing
-- constraint name collides with `recurring_expense_shape` / `recurring_transfer_shape` below.

-- `default 'expense'` makes this ALTER a no-op for every existing definition (every row already
-- satisfies the "expense" shape: category_id was NOT NULL, to_account_id doesn't exist yet), so
-- the ALTER cannot fail on deploy and needs no backfill.
alter table finance.recurring_transactions
  add column type text not null default 'expense' check (type in ('expense', 'transfer')),
  add column to_account_id uuid references finance.accounts(id) on delete restrict,
  alter column category_id drop not null;

-- Mirrors tx_transfer_has_no_category / tx_category_required on finance.transactions exactly.
alter table finance.recurring_transactions
  add constraint recurring_expense_shape check (
    type <> 'expense' or (category_id is not null and to_account_id is null)),
  add constraint recurring_transfer_shape check (
    type <> 'transfer' or (category_id is null and to_account_id is not null
                           and to_account_id <> account_id));
