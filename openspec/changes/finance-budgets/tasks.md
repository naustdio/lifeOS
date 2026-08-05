# Tasks: Finance Budgets — Per-Category Monthly Limits

> Task IDs use the `B-` prefix (`B-001`..`B-011`) to avoid colliding with the archived
> `lifeos-foundation` cycle's `T-` IDs. Each task cites the exact spec requirement(s) it satisfies
> via `finance-budgets/Requirement Name`. Design section references use `design.md §N`. The file
> set below mirrors `design.md §7` (File Changes) exactly — every row in that table is covered by
> exactly one task here.
>
> Inputs are final and decided: `proposal.md`, `specs/finance-budgets/spec.md` (9 requirements,
> including the DELETE-policy "Budgets Can Be Removed" requirement added after initial design
> review), and `design.md` (DDL, TS signatures incl. `removeBudget`, UI flow, §8 testing strategy).
> Nothing here re-opens scope.

## Grouping

- **(a) Database** — `finance.budgets` + triggers + `finance.budget_progress` view; RLS + grants
- **(b) Domain layer** — pure evaluation functions
- **(c) Data layer** — repository incl. `removeBudget`
- **(d) Presupuestos screen** — create/edit/remove UI
- **(e) Over-budget gate wiring** — `TransactionForm`, `EditTransactionForm`, `OverBudgetDialog`
- **(f) pgTAP suites** — per `design.md §8`
- **(g) Vitest unit + RTL render tests** — per `design.md §8`

See the Review Workload Forecast at the end for line estimates and PR chaining guidance.

---

## (a) Database

- [x] B-001 — `finance.budgets` table + triggers + `finance.budget_progress` view
  - Migration `supabase/migrations/*_finance_budgets.sql`.
  - `finance.budgets`: exact DDL per `design.md §1` — `id, household_id, category_id (FK, on delete restrict), limit_cents (check > 0), created_at, updated_at`, unique constraint `budgets_one_per_category (household_id, category_id)`. No `period_month` column (deviation note in proposal — rollover/history is an explicit non-goal).
  - `finance.enforce_budget_category()` trigger function: plain (invoker) `plpgsql`, **no** `security definer`, raises `22023` when the referenced category is not found, is in a different household, or is not `kind = 'expense'`. `before insert or update of category_id, household_id`.
  - `budgets_touch_updated_at` trigger using the existing `core.touch_updated_at()`.
  - `finance.budget_progress` view **with `security_invoker = true`** (regular view, never materialized), per `design.md §2`: sargable half-open `occurred_on` range (`>= date_trunc('month', current_date) < ... + interval '1 month'`), `status = 'posted'`, `type = 'expense'`, `LEFT JOIN` so a zero-spend budget still returns a row, `spent_cents` as `coalesce(sum(-t.amount_cents), 0)` (positive magnitude).
  - **Trap**: omitting `security_invoker = true` is the Supabase `security_definer_view` RLS-bypass footgun — this is a named acceptance criterion in the proposal's risk table, not an optional hardening step.
  - Satisfies: `finance-budgets/Budgets Are Opt-In and Expense-Only` (trigger scenario), `finance-budgets/One Budget Per Category` (unique constraint), `finance-budgets/Derived Current-Month Progress, No Rollover`, `finance-budgets/Voided and Transfer Transactions Excluded From Spend`.
  - Depends on: none (first Finance-budgets migration; builds on the already-shipped `finance.categories`/`finance.transactions`/`core.touch_updated_at`).
  - Parallel: sequential (must land before B-002 and everything else in this change).

- [x] B-002 — RLS policies + grants on `finance.budgets` / `finance.budget_progress`
  - Migration `supabase/migrations/*_finance_budgets_security.sql`.
  - `alter table finance.budgets enable row level security;` then four policies exactly per `design.md §3`: `budgets_select`, `budgets_insert`, `budgets_update` (USING + WITH CHECK), **`budgets_delete`** — all `to authenticated`, tenant key is `core.is_member(household_id)`, never `auth.uid()` directly.
  - `grant select, insert, update, delete on finance.budgets to authenticated; grant select on finance.budget_progress to authenticated;` — both grants are load-bearing given migration 6's `alter default privileges ... revoke all`.
  - Satisfies: `finance-budgets/Budgets Can Be Removed` (DELETE policy — the requirement added after initial design review), `finance-budgets/Tenant Isolation on Budgets and Progress` (both scenarios).
  - Depends on: B-001.
  - Parallel: sequential.

---

## (b) Domain Layer

- [x] B-003 — `src/modules/finance/domain/budget.ts` (pure)
  - `evaluateBudgetImpact({ limitCents, spentCents, deltaCents }): BudgetImpact` — confirmation warranted only when `deltaCents > 0` and the projected spend meets or exceeds the limit (`>=`); a delta of zero or less never prompts. Unbudgeted (`limitCents = null`) never prompts.
  - `budgetDeltaForEdit({ previousCategoryId, previousAmountCents, nextCategoryId, nextAmountCents })` — per `design.md §4` table: same category → `next − previous` against that category; category changed → `+next` against the **new** category only (old category is never re-checked on a move).
  - No Supabase import — pure functions only.
  - Re-export from `src/modules/finance/domain/index.ts` alongside `amount`/`transfer`/`account`/`category`.
  - Satisfies: `finance-budgets/Non-Blocking Over-Budget Confirmation on Entry` (evaluation logic), `finance-budgets/Over-Budget Check Re-Runs on Edit` (delta logic).
  - Depends on: none (pure, spec-driven; independent of the DB track).
  - Parallel: yes, parallel with B-001/B-002.

---

## (c) Data Layer

- [x] B-004 — `src/modules/finance/data/budget-repository.ts`
  - `listBudgetsWithProgress(supabase, householdId): Promise<BudgetProgressItem[]>` and `getProgressForCategory(supabase, householdId, categoryId): Promise<BudgetProgressItem | null>` — client-direct RLS reads via `supabase.schema("finance").from("budget_progress")`, matching the `category-repository.ts`/`summary-repository.ts` pattern: `Number()` every `bigint`-backed column, degrade to `[]`/`null` on error rather than throwing.
  - `upsertBudgetLimit(supabase, householdId, categoryId, limitCents): Promise<{ error: string | null }>` — RLS-guarded upsert on the `(household_id, category_id)` unique constraint.
  - `removeBudget(supabase, householdId, categoryId): Promise<{ error: string | null }>` — RLS-guarded hard `DELETE`. Budgets have no dependents, so no soft-delete flag is involved.
  - Re-export from `src/modules/finance/data/index.ts`.
  - **No `server-only` import, no `.rpc()`** — this file deliberately follows the `finance.categories`-style exception documented in `finance/api/index.ts`'s header comment: `finance/api` remains untouched (zero-diff success criterion).
  - Satisfies: `finance-budgets/Budgets Are Opt-In and Expense-Only` (UI-reachable opt-in), `finance-budgets/One Budget Per Category` (upsert semantics), `finance-budgets/Budgets Can Be Removed` (`removeBudget` — the DELETE-policy requirement), `finance-budgets/Tenant Isolation on Budgets and Progress` (repository-level RLS reliance).
  - Depends on: B-002 (needs the RLS policies and grants live to be meaningfully implemented/verified against).
  - Parallel: no (sequential after B-002); parallel with B-003 since they touch disjoint files.

---

## (d) Presupuestos Screen

- [ ] B-005 — `(app)/presupuestos/` screen: list, opt-in, edit, remove
  - `src/app/(app)/presupuestos/page.tsx` (server): `listActiveCategories(supabase, hh, "expense")` + `listBudgetsWithProgress(supabase, hh)`, passed as props to `<BudgetForm>`.
  - `src/app/(app)/presupuestos/BudgetForm.tsx` (client): one row per active expense category — category name, opt-in control, MXN limit input, progress bar (`spentCents / limitCents`, clamped at 100%, `text-expense` token once at/over limit, no raw hex per `check-tokens.mjs`). A budgeted row shows a **"quitar presupuesto"** action; confirming reverts the row to unbudgeted (no limit, no progress bar), re-enabling the opt-in control. Single-column layout, usable at 375px, light and dark.
  - `src/app/(app)/presupuestos/actions.ts`: `setBudgetLimitAction` (→ `upsertBudgetLimit`) and `removeBudgetAction` (→ `removeBudget`) Server Actions.
  - Archived categories fall out of `listActiveCategories` automatically — this is the entire mechanism satisfying the archived-category requirement; the budget row itself is never touched.
  - Satisfies: `finance-budgets/Budgets Are Opt-In and Expense-Only` (both UI scenarios: unbudgeted state, income categories hidden from picker), `finance-budgets/One Budget Per Category` (edit-updates-not-duplicates UI), `finance-budgets/Budgets Can Be Removed` (both scenarios: row deletion, reverts to unbudgeted and can be re-budgeted), `finance-budgets/Archived Category Leaves Its Budget Row Untouched` (both scenarios).
  - Depends on: B-004.
  - Parallel: sequential after B-004; may run in parallel with B-006 (disjoint files).

---

## (e) Over-Budget Gate Wiring

- [ ] B-006 — `OverBudgetDialog.tsx` (presentational)
  - `src/app/(app)/movimientos/OverBudgetDialog.tsx` — new component, props in (`onConfirm`/`onCancel`), Spanish copy, no data access, no domain import beyond the `BudgetImpact` type shape.
  - Satisfies: `finance-budgets/Non-Blocking Over-Budget Confirmation on Entry` (confirmation UI shell — dispatch wiring lands in B-007/B-008).
  - Depends on: B-003 (consumes the `BudgetImpact` type).
  - Parallel: yes, parallel with B-004/B-005.

- [ ] B-007 — Wire the over-budget gate into `TransactionForm` + `movimientos/page.tsx`
  - `src/app/(app)/movimientos/page.tsx` (server, modify): fetch `listBudgetsWithProgress(supabase, hh)`, pass `budgets` down.
  - `src/app/(app)/movimientos/TransactionForm.tsx` (client, modify): accepts a `budgets: BudgetProgressItem[]` prop; gate applies to the **expense tab only** (income/transfer tabs unaffected — transfers carry no `category_id`). Switch submission from `<form action={dispatch}>` to `<form onSubmit={...}>`: `event.preventDefault()` only when `evaluateBudgetImpact(...).crossesLimit`, stash the `FormData`, render `<OverBudgetDialog>`; on confirm, `startTransition(() => dispatch(pendingFormData))` — the confirmed submission is byte-identical to the unconfirmed one, per `design.md §5`. **Verify at implementation time** (design's own open item) that `useActionState`'s dispatch accepts a stashed `FormData` inside `startTransition` on the pinned React/Next versions.
  - Satisfies: `finance-budgets/Non-Blocking Over-Budget Confirmation on Entry` (all four scenarios: shown when crossing, confirming records unchanged, cancelling records nothing, no prompt when under limit).
  - Depends on: B-003, B-004, B-006.
  - Parallel: yes, parallel with B-008 (disjoint files).

- [ ] B-008 — Wire the over-budget gate into `EditTransactionForm` + `editar/page.tsx`
  - `src/app/(app)/movimientos/[id]/editar/page.tsx` (server, modify): fetch `listBudgetsWithProgress(supabase, hh)`, pass `budgets` down.
  - `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` (client, modify): accepts a `budgets` prop; uses `budgetDeltaForEdit` against the `transaction` prop it already receives (`categoryId`, `amountCents`) versus submitted values; same `onSubmit`/`OverBudgetDialog`/`startTransition` pattern as B-007, imported as `../../OverBudgetDialog`. The void form is untouched.
  - Satisfies: `finance-budgets/Over-Budget Check Re-Runs on Edit` (both scenarios: amount increase past limit, category change to a budgeted category past its limit).
  - Depends on: B-003, B-004, B-006.
  - Parallel: yes, parallel with B-007 (disjoint files).

---

## (f) pgTAP Suites

- [ ] B-009 — pgTAP: RLS, `security_invoker` regression, expense-kind trigger, current-month progress, uniqueness & archive
  - `supabase/tests/*_budgets.sql`, per `design.md §8` (five DB rows):
    - **Tenancy**: member sees own `finance.budgets` rows; non-member and `anon` see zero; a member can `DELETE` their own household's budget row; a non-member's `DELETE` affects zero rows.
    - **`security_invoker` regression**: a non-member session reading `finance.budget_progress` for a space with budgeted spend returns zero rows — this MUST fail if `with (security_invoker = true)` is dropped from the view.
    - **Expense-kind trigger**: insert referencing an income category raises `22023` and creates no row; insert referencing an expense category succeeds; `UPDATE ... set category_id = <income category>` is rejected too; a category from another space is rejected.
    - **Current-month progress**: last month's posted expense does not count, this month's does; `spent_cents` is a positive magnitude; a voided expense is excluded; a `transfer` row carrying a `category_id` is excluded; an income row in the same category is excluded; a budget with no transactions returns a row with `spent_cents = 0` (LEFT JOIN regression).
    - **Uniqueness & archive**: a second budget for the same `(household_id, category_id)` violates `budgets_one_per_category`; `limit_cents = 0` is rejected; archiving a budgeted category leaves the budget row byte-identical (no cascade, no flag).
  - Satisfies: `finance-budgets/Budgets Are Opt-In and Expense-Only` (trigger cases), `finance-budgets/One Budget Per Category` (uniqueness), `finance-budgets/Budgets Can Be Removed` (DELETE RLS cases), `finance-budgets/Derived Current-Month Progress, No Rollover` (both scenarios), `finance-budgets/Tenant Isolation on Budgets and Progress` (both scenarios), `finance-budgets/Archived Category Leaves Its Budget Row Untouched` (byte-identical scenario), `finance-budgets/Voided and Transfer Transactions Excluded From Spend` (both scenarios).
  - Depends on: B-001, B-002.
  - Parallel: yes, parallel with B-003–B-008 once B-001/B-002 land (test-only file, no app-code dependency).

---

## (g) Vitest Unit + RTL Render Tests

- [ ] B-010 — Vitest: pure domain evaluation tests
  - `tests/unit/finance-budget-domain.test.ts` against `modules/finance/domain/budget.ts`, per `design.md §8`:
    - `evaluateBudgetImpact`: under limit → no prompt; exactly at limit → prompt (`>=` boundary); over → prompt; unbudgeted (`limitCents = null`) → never prompt; zero/negative delta → never prompt even when already over.
    - `budgetDeltaForEdit`: same-category delta is `next − previous`; category-change delta is `+next` against the new category; unchanged submission yields delta 0.
  - No DB dependency.
  - Satisfies: `finance-budgets/Non-Blocking Over-Budget Confirmation on Entry` (unit coverage of the evaluation boundary), `finance-budgets/Over-Budget Check Re-Runs on Edit` (unit coverage of the delta arithmetic).
  - Depends on: B-003.
  - Parallel: yes, parallel with B-004–B-009.

- [ ] B-011 — RTL render tests: `BudgetForm`, `TransactionForm`, `EditTransactionForm`
  - `tests/unit/budget-form-render.test.tsx` (new, per the `*-form-render.test.tsx` precedent): renders a row per active expense category; shows a progress bar and a "quitar presupuesto" action only for budgeted rows; offers no income category; removing a budget reverts the row to unbudgeted.
  - `tests/unit/transaction-form-render.test.tsx` (modify): new `budgets` prop; crossing the limit renders the dialog and does **not** dispatch; confirming dispatches once; cancelling dispatches never; staying under the limit dispatches with no dialog.
  - `tests/unit/edit-transaction-form-render.test.tsx` (modify): new `budgets` prop; raising an amount past the limit prompts; lowering it does not; switching to a budgeted category over its limit prompts.
  - Prop-driven, no network mocking, per `design.md §5`'s "progress passed as a prop" decision.
  - Satisfies: `finance-budgets/Budgets Are Opt-In and Expense-Only` (render-level opt-in/income-exclusion), `finance-budgets/Budgets Can Be Removed` (render-level removal), `finance-budgets/Non-Blocking Over-Budget Confirmation on Entry` (all four scenarios, render level), `finance-budgets/Over-Budget Check Re-Runs on Edit` (both scenarios, render level).
  - Depends on: B-005, B-006, B-007, B-008.
  - Parallel: sequential (last task — exercises everything above it).

---

## Review Workload Forecast

Cached session review budget: **800 changed lines**. Estimates below are rough LOC per task
including migrations, TS, and tests; actual counts will vary with implementation style.

| Group | Tasks | Est. changed lines | Budget risk (800-line threshold) | Chaining recommendation |
|---|---|---|---|---|
| (a) Database | B-001, B-002 | ~140–180 | Comfortably under budget. | Single PR — table/trigger/view + RLS/grants are tightly coupled and the highest-review-value group (`security_invoker`, trigger cross-table assertion) to keep isolated and easy to scrutinize alone. |
| (b) Domain | B-003 | ~70–100 | Trivially under budget. | Can ride with (a) or (c) as a small addendum, or land standalone — pure, no DB dependency. |
| (c) Data | B-004 | ~90–130 | Under budget. | Single PR, chained after (a); pairs naturally with (b) into one "domain + data" PR (~160–230 lines). |
| (d) Presupuestos screen | B-005 | ~150–210 | Under budget. | Single PR, chained after (c). |
| (e) Gate wiring | B-006, B-007, B-008 | ~220–320 | Under budget alone, but combined with (d) risks crossing 500+. | Single PR for (e), chained after (b)+(c); B-007/B-008 can be reviewed together since they share the identical `onSubmit`/`startTransition` pattern. |
| (f) pgTAP | B-009 | ~220–320 | Under budget alone. | Single PR, can review in parallel with (d)/(e) since it depends only on (a). |
| (g) Vitest + RTL | B-010, B-011 | ~230–330 | Under budget alone. | Single PR, chained last — B-011 exercises (d) and (e), so it cannot land before both. |

**Total estimated change**: ~1120–1590 lines across the whole slice — **over the 800-line budget
as one PR**, consistent with how the archived cycle handled multi-hundred-line slices. Recommended
chaining: **4 PRs**, each individually well under 800 lines:

1. **DB** (B-001, B-002) — ~140–180 lines, land first.
2. **Domain + data** (B-003, B-004) — ~160–230 lines, chained after PR 1.
3. **UI** (B-005, B-006, B-007, B-008) — ~370–530 lines, chained after PR 2. If this drifts toward
   the upper estimate, split further into "presupuestos screen" (B-005, B-006) and "gate wiring"
   (B-007, B-008) as two PRs.
4. **Tests** (B-009, B-010, B-011) — ~450–650 lines, chained after PR 3 (B-011 depends on PR 3);
   B-009 can review in parallel with PR 3 since it only depends on PR 1. If this drifts high, split
   pgTAP (B-009) from Vitest/RTL (B-010, B-011) into two PRs.

**Decision needed before `sdd-apply` runs**: confirm whether the 4-PR chain above is acceptable, or
whether a coarser/finer grouping is preferred — consistent with `delivery_strategy = ask-on-risk`
for this session, since PR 3 and PR 4 both carry a real chance of tipping past 500 lines depending
on implementation verbosity.

---

## Dependency Summary (critical path)

```
B-001 (budgets table + triggers + view) → B-002 (RLS + grants)
B-002 → B-004 (repository, incl. removeBudget)
B-003 (domain, no DB dep) → B-006 (OverBudgetDialog)          [parallel with B-001/B-002]
B-004 → B-005 (presupuestos screen)
B-003, B-004, B-006 → B-007 (TransactionForm wiring)          [parallel with B-008]
B-003, B-004, B-006 → B-008 (EditTransactionForm wiring)      [parallel with B-007]
B-001, B-002 → B-009 (pgTAP)                                  [parallel with B-005–B-008]
B-003 → B-010 (Vitest domain unit)                            [parallel with B-004–B-009]
B-005, B-006, B-007, B-008 → B-011 (RTL render, last)
```

Testing tasks (B-009, B-010, B-011) are not TDD gates — they accompany the logic they test rather
than blocking every prior task, per the design's `§8` testing strategy table.
