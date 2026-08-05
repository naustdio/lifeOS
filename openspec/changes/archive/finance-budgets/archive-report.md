# Archive Report — finance-budgets

**Change**: finance-budgets
**Archived**: 2026-08-05
**Closure method**: manual (orchestrator-driven), not via `gentle-ai review`/`sdd-archive` native gate

## Why manual closure

Same root cause as the archived `lifeos-foundation` cycle: `gentle-ai sdd-continue` kept `verify`
and `archive` blocked with *"verify evidence cannot enter remediation: missing valid
`gentle-ai.verify-result/v1` envelope... bounded review transaction is missing"*. The bounded
review transaction requires the `review-*` lens subagents to run `gentle-ai review
inspect-candidate` over frozen Git trees via shell, and this Claude Code project's `review-*`
agent definitions expose no `Bash` tool — the same tooling gap already documented in
`openspec/changes/archive/lifeos-foundation/archive-report.md`. The user directed the same manual
closure precedent be followed here rather than re-litigating the defect-report question.

## What was actually verified (real evidence, independently re-executed)

Per `verify-report.md` (sdd-verify agent, 2026-08-05), run against the tip of the 4-PR stacked
chain before any PR was merged:

| Check | Result |
|---|---|
| `pnpm verify` | Clean PASS, 11 routes incl. `/presupuestos` |
| `supabase test db` (pgTAP) | `Files=8, Tests=103, PASS` (20 new assertions in `080_finance_budgets.sql`) |
| `pnpm test` (vitest) | 74/74 pass on a clean run (one transient JWT-clock flake on first attempt, cleared on retry — pre-existing flake class, not a regression) |
| Task completeness | 11/11 tasks (B-001..B-011) checked complete |
| `security_invoker = true` on `finance.budget_progress` | Confirmed present in the migration, with its own pgTAP regression test |
| `recordTransaction`/`updateTransaction` unchanged | Independently re-diffed against `main` — confirmed byte-for-byte identical |
| "Budgets Can Be Removed" (added mid-cycle after design review) | Confirmed end-to-end: DELETE RLS policy, `removeBudget` repository function, "Quitar presupuesto" UI action, dedicated pgTAP coverage |

**CRITICAL findings**: none.

**WARNINGs** (all minor, none blocking):

- Transient JWT-clock test flake on local Supabase stack after long idle — clears on retry, matches
  a pre-existing disclosed flake class.
- Cosmetic route-count wording mismatch in `state.yaml` ("12 routes" vs. 11 observed) — no
  functional gap.
- All 4 PRs were still open (not merged) at verify time — resolved after verify: PRs #10-#13 were
  merged in stacked order (10 -> 11 -> 12 -> 13), each retargeted to `main` as its predecessor
  landed, all clean, no conflicts.

## Post-verify fix (found during user review, before merge)

The user reviewed the running app locally and found `/presupuestos` was unreachable from the UI:
the screen existed and worked, but no task in `tasks.md` or file in `design.md §7` covered adding
a link to the app shell's bottom `NavPill` (`src/app/(app)/layout.tsx`). Fixed in a follow-up
commit (`d689aab`, landed inside PR #13 before merge) adding a "Presupuestos" link alongside
"Inicio"/"Cuentas". This is recorded here as a real gap in the original task breakdown, not silently
absorbed — a future cycle's task template should explicitly enumerate "wire into the app shell nav"
as a checklist item whenever a new top-level screen is added.

## Spec merge

The new capability spec `specs/finance-budgets/spec.md` (9 requirements, including the
mid-cycle-added "Budgets Can Be Removed") was copied verbatim into `openspec/specs/finance-budgets/spec.md`
as a new capability alongside the 7 existing main specs from `lifeos-foundation`. No merge conflict
— this is a net-new capability, not a modification of an existing one.

## Outcome

Change `finance-budgets` is **complete and closed**: opt-in per-expense-category monthly budgets,
derived current-month progress with no rollover, RLS/`security_invoker`-correct tenant isolation,
and a non-blocking client-side over-budget confirmation on both transaction entry and edit — with
`finance/api`'s actual write seam (`recordTransaction`/`updateTransaction`) untouched. All 4 PRs
(#10-#13) merged to `main` in stacked order.

This folder moves to `openspec/changes/archive/finance-budgets/` as the closure record.
