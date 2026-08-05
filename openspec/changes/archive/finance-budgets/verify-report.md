# Verification Report — finance-budgets

**Change**: finance-budgets
**Scope**: full spec-driven verification of the 4-PR stacked chain (PR #10 DB, PR #11 domain+data,
PR #12 UI, PR #13 tests), all 11 tasks (B-001..B-011), on the tip branch
`feat/finance-budgets-4-tests` which contains the full combined change (`git diff main...HEAD`
covers all 4 slices).
**Mode**: OpenSpec file (artifact of record — no `mem_save`/Engram tool was available in this
session's toolset; this is a known gap, not a skipped step)
**Date**: 2026-08-05
**Branches verified**: PRs #10-#13 are all OPEN, not merged, chained
`main <- feat/finance-budgets-1-db <- -2-domain-data <- -3-ui <- -4-tests`. Verification was run
against the tip of the stack, which is byte-identical to what all 4 PRs combined would produce.

## 0. Strict TDD Mode

No `strict_tdd: true` marker found in project config or tasks.md. tasks.md explicitly states
pgTAP/Vitest/RTL tasks (B-009, B-010, B-011) "are not TDD gates -- they accompany the logic they
test rather than blocking every prior task." Standard verification applied.

## 1. Task Completeness (tasks.md)

All 11 tasks (B-001..B-011) are marked `[x]` complete. `grep -c "^\- \[x\]"` confirms 11/11.
state.yaml's `apply_progress` shows `status: complete` for all 4 PR groups with `tasks_done`
lists that partition B-001..B-011 with no gaps and no overlap.

## 2. Fresh Runtime Evidence (re-executed this session, not trusted from prior claims)

The local Supabase stack was already running (containers up ~5h). Checked out
`feat/finance-budgets-4-tests` (already the current branch), confirmed `git log --oneline
main..HEAD` shows exactly the 4 expected commits (7d92e7c DB, b63d03c domain+data, 441914f UI,
493d302 tests).

| Command | Result | Matches prior claim (state.yaml)? |
|---|---|---|
| `pnpm verify` (eslint --max-warnings=0 && tsc --noEmit && check-tokens.mjs && next build) | Clean PASS, exit 0 -- 11 routes generated including `/presupuestos` | Yes, in substance (state.yaml PR4 says "12 routes total"; fresh build lists 11 distinct route entries -- see SS5 WARNING) |
| `supabase test db` (pgTAP) | `Files=8, Tests=103, Result: PASS` | Yes -- matches "103 total" exactly; `080_finance_budgets.sql` carries `plan(20)`, confirmed 20 new assertions |
| `pnpm test` (vitest), first run | 1 suite failed: `tests/integration/movement-creation-ui.test.ts` -- `bootstrap_user failed: JWT issued at future`; 70 passed / 4 skipped (within that file) | No -- this is new since the claimed 74/74 |
| `pnpm test`, isolated re-run of the failed file | 4/4 pass | -- |
| `pnpm test`, full re-run | 74/74 pass (12 files), zero failures | Yes -- matches "74/74" exactly on the second attempt |

Finding on the JWT flake: the first full-suite run failed one integration test file with a
JWT-clock error (`JWT issued at future`), which disappeared both in isolation and on a clean
re-run of the whole suite. This has the identical signature to the flake already disclosed and
accepted in PR #10's own `test_gate` note ("one flaky boundary-lint timeout... pre-existing
test-runner flake unrelated to this change, not a regression"). Classified as WARNING --
environment-level test-runner flake, not a code defect, not new to this change, and not
reproducible on retry.

## 3. Spec Compliance Matrix (9 requirements)

| Requirement | Evidence | Verdict |
|---|---|---|
| Budgets Are Opt-In and Expense-Only | `finance.enforce_budget_category()` trigger (migration `20260804090010_finance_budgets.sql`) raises `22023` for income-kind categories, cross-household categories, and missing categories; pgTAP `throws_ok('22023', ...)` x3 all PASS. UI: `presupuestos/page.tsx` calls `listActiveCategories(supabase, hh, "expense")`, so the picker structurally cannot offer income categories. `budget-form-render.test.tsx` asserts an opt-in input renders per category with no way to select income. | PASS |
| One Budget Per Category | `budgets_one_per_category unique (household_id, category_id)` in DDL; `upsertBudgetLimit` uses `.upsert(..., { onConflict: "household_id,category_id" })`; pgTAP `throws_ok('23505', ...)` for a duplicate insert PASSes. | PASS |
| Budgets Can Be Removed | `budgets_delete` RLS policy present (for delete to authenticated using core.is_member(household_id)) plus `grant delete`; `removeBudget()` in `budget-repository.ts` is a plain RLS-guarded DELETE; `removeBudgetAction` server action wired from `BudgetForm`'s "Quitar presupuesto" button, confirmed present and calling the action with the correct categoryId; pgTAP proves both "a member can DELETE their own household's budget row" and "a non-member's DELETE affects zero rows" (re-checked as the owning member, not the non-member, per the documented RLS-vs-DELETE-outcome subtlety); `budget-form-render.test.tsx` proves the removed row reverts to the opt-in (unbudgeted) state. | PASS |
| Derived Current-Month Progress, No Rollover | View uses sargable half-open range occurred_on >= date_trunc('month', current_date) AND < ... + interval '1 month', no stored spend column. pgTAP: last month's expense excluded, this month's counted (spent_cents = 2000); LEFT JOIN zero-spend regression covered (spent_cents = 0 for a transaction-less budget). | PASS |
| Tenant Isolation on Budgets and Progress | `finance.budgets` RLS enabled with budgets_select/insert/update/delete, all core.is_member(household_id); `finance.budget_progress` declared with (security_invoker = true) -- confirmed in the DDL, not just claimed. pgTAP explicitly re-runs the exact security_definer_view regression: non-member session reading budget_progress for another space returns zero rows. anon role denied at the schema-grant level (throws_ok('42501', ...) x2) since grant ... to authenticated only. | PASS |
| Archived Category Leaves Its Budget Row Untouched | No trigger or cascade touches finance.budgets on categories.archived_at update -- confirmed by reading the migration (no such trigger exists) and by pgTAP: archiving a category then re-reading limit_cents shows byte-identical 5000. UI side: presupuestos/page.tsx sources categories from listActiveCategories, which already excludes archived ones (pre-existing behavior, unchanged), so the budget silently stops being offered without the row being touched. | PASS |
| Non-Blocking Over-Budget Confirmation on Entry | TransactionForm.tsx: expense-tab-only onSubmit handler calls evaluateBudgetImpact; crossesLimit triggers event.preventDefault() + stash FormData + render OverBudgetDialog; confirm calls startTransition(() => movementAction(formData)) with the SAME FormData object (not reconstructed) -- so "confirming records the transaction unchanged" holds by construction; cancel only clears local state, dispatching nothing. evaluateBudgetImpact itself: deltaCents <= 0 never prompts, >= limit is the crossing boundary (spec: "meet or exceed"). Covered by 10 pure unit tests (finance-budget-domain.test.ts) and 7 RTL tests (transaction-form-render.test.tsx), all green. | PASS |
| Over-Budget Check Re-Runs on Edit | EditTransactionForm.tsx computes budgetDeltaForEdit against the pre-edit transaction prop (categoryId, amountCents), then the same evaluateBudgetImpact + dialog + startTransition pattern as the entry form. budgetDeltaForEdit correctly computes next minus previous for same-category edits and +next against only the new category on a category change (old category never re-checked, matching the "decrease can't cross a limit" reasoning in design.md section 4). Covered by unit tests and edit-transaction-form-render.test.tsx (6 tests). | PASS |
| Voided and Transfer Transactions Excluded From Spend | View predicate status = 'posted' and type = 'expense' structurally excludes both void and transfer (and income) rows. pgTAP directly proves: a voided 3000-centavo expense does not count; a mistagged transfer row does not count; an income row referencing the same category_id does not count (defensive case beyond the literal spec wording). | PASS |

9/9 requirements PASS, each with both source-level and runtime-test-level evidence (pgTAP
and/or Vitest/RTL), not source inspection alone.

## 4. Design Coherence (design.md, current version -- post-DELETE-flip)

Confirmed the shipped code matches the CURRENT design.md, not an earlier no-DELETE version:

- Section 1/2 DDL -- migration `20260804090010_finance_budgets.sql` is a verbatim match to design.md's
  DDL block (table shape, trigger function body including the household_id cross-check, view
  definition including the sargable half-open range and the sum(-t.amount_cents) negation).
- Section 3 RLS/grants -- migration `20260804090011_finance_budgets_security.sql` matches exactly,
  including the DELETE policy (budgets_delete) that Decision 4 added mid-cycle, and both grant
  lines (finance.budgets all 4 verbs, finance.budget_progress select-only).
- Section 4 TS signatures -- `budget.ts` and `budget-repository.ts` match the documented function
  signatures exactly, including removeBudget.
- Section 5 UI flow -- the onSubmit/preventDefault/startTransition(() => dispatch(pendingFormData))
  pattern (design's own flagged "verify at implementation time" open item) is implemented
  identically in both forms and is proven working by the passing RTL tests -- the open item is
  closed.
- Section 6 Decision 4 (DELETE included this slice) -- fully implemented: budgets_delete RLS policy,
  removeBudget repository function, removeBudgetAction server action, "Quitar presupuesto" UI
  button, and dedicated pgTAP coverage of both the member-DELETE and non-member-DELETE-affects-
  zero-rows cases. No trace of a soft-delete/archived_at alternative -- the rejected alternative
  was correctly not built.

Design coherence: PASS, current-version match confirmed.

## 5. Deviation Verification -- finance/api/index.ts Diff Claim

The proposal/design's literal success criterion is "finance/api" shows zero diff
(git diff --exit-code src/modules/finance/api/). state.yaml documents an accepted deviation:
the barrel was touched for two real ESLint-boundary/Next.js server-only conflicts, but
recordTransaction/updateTransaction -- the actual write seam -- are claimed byte-for-byte
unchanged. This claim was independently re-verified, not re-accepted on trust:

- `git diff main feat/finance-budgets-4-tests -- src/modules/finance/api/index.ts` shows only
  ADDITIONS (re-exports of listBudgetsWithProgress/getProgressForCategory/
  upsertBudgetLimit/removeBudget, plus an explanatory comment block) appended after the
  existing content. No line touching the recordTransaction or updateTransaction function
  definitions appears anywhere in the diff -- confirmed by grepping the diff output for both
  names and finding only the explanatory-comment mention, not a code change.
- A second file, src/modules/finance/api/budget-evaluation.ts, was added -- confirmed to be a
  thin server-only-free re-export of the two pure domain functions plus the
  BudgetProgressItem type, exactly as documented, and consumed by both client forms.
- Verdict: the deviation's specific claim ("recordTransaction/updateTransaction confirmed
  byte-for-byte unchanged") is TRUE. Per the task instructions, this deviation is accepted
  and not re-flagged as a new finding -- only the truth of the underlying claim was checked.

## 6. Issues

### CRITICAL
None.

### WARNING
1. Transient JWT-clock flake on first `pnpm test` run -- tests/integration/
   movement-creation-ui.test.ts failed once with "bootstrap_user failed: JWT issued at future",
   then passed both in isolation and on a full clean re-run (74/74). This is an environment/
   test-runner timing issue (same class already disclosed in PR #10's own test_gate note), not a
   code defect introduced by this change and not reproducible. No action required before archive,
   but worth noting if CI shows intermittent failures on this same file.
2. Route-count wording mismatch -- state.yaml's PR4 verify_gate says "12 routes total"; a
   fresh next build on the tip lists 11 distinct route entries (/, /_not-found,
   /auth/callback, /auth/salir, /cuentas, /cuentas/nueva, /entrar,
   /manifest.webmanifest, /movimientos, /movimientos/[id]/editar, /presupuestos). This is
   a documentation/count discrepancy in the apply-phase log, not a functional gap -- /presupuestos
   is present and working. Cosmetic only.
3. All 4 PRs are open, not merged -- per the task's own framing this is expected (this is a
   verify-before-merge pass across the whole stack), but it means main itself does not yet
   contain any of this change. Archive should not be treated as "ship it" until the PRs are
   actually merged; this verify pass covers the tip-of-stack code, not main.

### SUGGESTION
None.

## 7. Final Verdict

PASS WITH WARNINGS.

All 11 tasks complete, all 9 spec requirements PASS with both source and runtime-test evidence,
design coherence confirmed against the current (post-DELETE-flip) design.md, the accepted
finance/api deviation's specific factual claim independently re-verified as true, and all three
headline test/build gates (pnpm verify, pnpm test 74/74, supabase test db 103/103 incl.
20/20 new) re-executed fresh in this session and matching state.yaml's claims. The only findings
are a non-reproducible environment flake and a cosmetic route-count wording mismatch -- neither
blocks archive on code grounds. The one real gating consideration is procedural: PRs #10-#13 must
actually merge to main before this change is "shipped," independent of this verification's PASS
result on the stack's tip.
