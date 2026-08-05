# Proposal: Finance Budgets — Per-Category Monthly Limits

## Intent

Finance records where money went, but never warns while it is going. The owner only discovers overspending after the month closes. Budgets add an opt-in monthly spending limit per expense category, with live spent-vs-limit progress and a confirmation prompt at the moment of entry — turning Finance from a ledger into a guardrail. This is slice 4 of `lifeos-foundation`, and exactly the additive `finance.budgets` table pre-planned in that cycle's `design.md §3.6`.

## Scope

### In Scope
- `finance.budgets` table: `(id, household_id, category_id FK, limit_cents, created_at, updated_at)`, unique `(household_id, category_id)`, RLS via `core.is_member(household_id)` (SELECT/INSERT/UPDATE) — same plain-RLS shape as `finance.categories`, no seam function.
- `BEFORE INSERT/UPDATE` trigger enforcing the referenced category has `kind = 'expense'` (cross-table rule Postgres cannot CHECK).
- `finance.budget_progress` view **with `security_invoker = true`**, joining budgets to the live sum of current-month `posted`, non-`transfer` expense transactions per category.
- `src/modules/finance/data/budget-repository.ts` — client-direct RLS reads (list budgets, progress for one category), matching the existing finance read pattern.
- Minimal `(app)/presupuestos/` screen: per-expense-category opt-in toggle + limit input + progress bar.
- Client-side over-budget confirmation in the transaction entry **and** edit forms, before calling `recordTransaction` / `updateTransaction`.

### Out of Scope
- Any change to `finance/api` (`recordTransaction`, `updateTransaction` signatures, error codes) — the check is client-side.
- Rollover / carry-forward of unused budget; per-month historical budget rows; budget reset jobs.
- Income-category budgets; budgets on parent-category rollups.
- A categories-management screen (none exists), UI polish, dashboard cards — separate later change.

## Capabilities

### New Capabilities
- `finance-budgets`: opt-in per-expense-category monthly limit, derived current-month progress, and non-blocking over-budget confirmation at entry.

### Modified Capabilities
- None. `finance-transactions` and `finance-module-api` requirements are unchanged; the confirmation is a client-side pre-check, not a new seam rule.

## Approach

**Budgets are configuration; progress is derived.** A budget row stores only the limit. "No rollover" is not a reset job — it falls out of the view filtering `date_trunc('month', occurred_on) = date_trunc('month', current_date)`, consistent with the schema's timezone-free convention. No mutable spent column, so no drift (same reasoning as `account_balances`).

**Deviation from the archived sketch**: the original `finance.budgets` shape included `period_month`. Dropped, because per-month rows only exist to support rollover/history, which are explicit non-goals; `(household_id, category_id)` uniqueness is the simpler invariant.

**Plain RLS, no SECURITY DEFINER seam.** Per `design.md`'s own reasoning for why `finance.categories` needs no seam: a budget write is a single row with no multi-row invariant and no atomicity requirement. Adding a definer function would add privilege-escalation surface for nothing.

**The client warns, the ledger never lies.** Real money movement is always recordable. The entry and edit forms read `budget_progress` for the target category, and if the new/adjusted amount crosses the limit, show an alert requiring explicit confirmation before submitting. Refusing to record a real transaction would make the ledger wrong — the worse failure.

**Reads stay client-direct.** Progress is a read under RLS, so it goes through `finance/data`, not `finance/api`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | `finance.budgets`, expense-kind trigger, RLS policies, `finance.budget_progress` view |
| `src/modules/finance/domain/` | New | Budget types, over-budget evaluation logic (pure, unit-testable) |
| `src/modules/finance/data/budget-repository.ts` | New | List budgets, upsert limit, read progress |
| `src/modules/finance/ui/` | New/Modified | Budget list+editor; over-budget confirm dialog wired into entry + edit forms |
| `src/app/(app)/presupuestos/` | New | Minimal budgets screen |
| `src/modules/finance/api/` | Unchanged | Explicitly not touched |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `security_invoker = true` omitted on `budget_progress` → RLS bypass / Supabase `security_definer_view` finding | Med | Named as an explicit task acceptance criterion; pgTAP test asserting cross-space isolation through the view |
| Cross-table `kind = 'expense'` rule attempted as a CHECK constraint (invalid in PG) | Med | Trigger required; mirror the existing category parent/kind trigger |
| Race: two near-simultaneous expenses each under limit but jointly over | Low | **Accepted.** Same reasoning the codebase already applies to `update_transaction`'s lack of optimistic concurrency — a single-user product has no concurrent-editor problem |
| Client-side check bypassed (direct API call, disabled JS) | Low | **Accepted by design.** The check is advisory UX, not an invariant; the ledger is intentionally permissive |
| Scope creep into categories management / UI polish | Med | Explicit non-goals above; the budgets screen only toggles and sets limits |
| Category deleted/deactivated while budgeted | Low | FK behavior decided in spec phase (expected: cascade delete of the budget row) |

## Rollback Plan

Fully additive and reversible. Down path: `drop view finance.budget_progress; drop trigger ...; drop table finance.budgets cascade;`. No existing table is altered, no column is backfilled, no NOT NULL is retrofitted, and no tenant key changes — so dropping budgets returns the schema bit-for-bit to its post-`lifeos-foundation` shape. UI rollback is deleting the `(app)/presupuestos/` route and reverting the two form call sites; because `finance/api` is untouched, no other module or seam consumer can break. Existing transactions are never mutated by this change.

## Dependencies

- Archived `lifeos-foundation` migrations (`finance.categories`, `finance.transactions`, `core.is_member`) — all present.
- Existing index `finance.transactions (household_id, category_id, occurred_on) where status='posted' and type<>'transfer'` already serves the progress query; no new index required.

## Cross-Module Note

Finance is the base module. **No current or planned module assumes budget data.** Budgets are a Finance-internal read model, exposed via `finance/data` (Finance-internal) and not via the `finance/api` barrel — so no other module can depend on them today. If a future module (e.g. Shopping List spend warnings, or a dashboard card) needs budget progress, that requires a deliberate addition to the `finance/api` barrel and its own change.

## Success Criteria

- [ ] A category has no budget until the owner explicitly enables one; income categories cannot be selected.
- [ ] Setting a limit on an income category is rejected by the database trigger, not only by the UI.
- [ ] `finance.budget_progress` returns zero rows for another space's session (RLS honored through the view).
- [ ] Progress reflects only the current calendar month; on the 1st, a previously over-budget category reads 0 spent with the same limit.
- [ ] Recording an expense that crosses the limit shows a confirmation; confirming records the transaction unchanged, cancelling records nothing.
- [ ] Editing an existing transaction's amount or category re-runs the same check.
- [ ] Voided and `transfer` transactions are excluded from spend.
- [ ] The budgets screen is usable at 375px width in both light and dark themes.
- [ ] `pnpm verify` passes; `finance/api` shows zero diff.
