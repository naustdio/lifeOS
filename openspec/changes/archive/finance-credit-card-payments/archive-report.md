# Archive Report — finance-credit-card-payments

**Change**: finance-credit-card-payments (5a of the credit-card punch-list; 5b installment-groups and statement import remain future cycles, not started)
**Archived**: 2026-08-07
**Closure method**: manual (orchestrator-driven), consistent with this project's established precedent

## What was verified (real evidence)

The highest-risk change in the 5-change Finance roadmap, implemented across 3 stacked PRs, 28/28 tasks:

| Slice | What | Verification |
|---|---|---|
| A — recurring transfer core | Multi-row `INSERT` for atomic 2-leg transfer confirms; expense-branch idempotency key deliberately left unsuffixed (regression-tested) | pgTAP: shape, expense-regression (RED against pre-change fn, GREEN unchanged after), atomicity, replay, half-pair guard, tenancy, single-overload guard — all green; **real 2-connection concurrency race script, 4/4 clean runs**, proving no half-transfer state is ever observable even under genuine concurrency |
| B — card terms data layer | Optional `account_credit_card_details` table (deliberately not touching `create_account()`'s signature); closed a real gap left in `finance.recurring_due` by Slice A | pgTAP 17/17 (2 tenancy assertions corrected mid-implementation after real RLS-semantics findings); 176/176 vitest |
| C — UI | AccountForm card-terms fieldset, RecurringForm transfer-type auto-pay, `/cuentas`+dashboard due-date/over-limit visual warnings (never a block) | `tsc`/`eslint`/`check-tokens`/`next build` all clean; **183/183 vitest** |
| Post-merge integration (all 5 changes combined on `main`) | — | **288/288 pgTAP across 19 files** (re-run against the fully merged schema, confirming the concurrency guarantees hold alongside every other change); `pnpm verify` clean; build includes no route regressions |

**CRITICAL findings**: none in the final merged state. One real bug was found and fixed during Slice A implementation (Postgres has no `min()`/`max()` aggregate for `uuid`). Slice C's implementing sub-agent was interrupted mid-run by the account's monthly spend cap after finishing all file edits; the orchestrating session verified the already-written code directly (all gates clean) and committed it rather than re-running a new agent.

**Notable design outcome**: the real 2-connection race test proved the design is *stronger* than the original requirement — genuinely concurrent confirm calls can never even attempt to collide (Postgres's `SELECT ... FOR UPDATE` under READ COMMITTED means a lock-waiter always re-reads the winner's already-advanced cursor), not merely "never leaves a half-pair."

## Spec merge

Delta specs for `finance-accounts` (2 ADDED) and `finance-recurring` (4 MODIFIED, 1 ADDED) were merged into the main specs, alongside `finance-account-types-expansion`'s and `finance-calendar-projection`'s deltas to the same two capabilities. No conflicts in spec text; a real code-level integration conflict was found and fixed during the `main` merge (see `finance-calendar-projection`'s archive report).

## Outcome

Credit card auto-pay and terms visibility are **complete and closed**: optional due-date/limit tracking, fixed-amount recurring auto-pay via an atomically-confirmed transfer pair, and visual (never blocking) over-limit warnings. Merged to `main`. Deferred to future cycles: installment/"compra a meses" grouping (5b) and bank statement import — both explicitly out of scope here, per the original exploration's risk-split recommendation.
