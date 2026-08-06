# Archive Report — finance-dashboard-feed

**Change**: finance-dashboard-feed
**Archived**: 2026-08-06
**Closure method**: manual (orchestrator-driven), not via `gentle-ai review`/`sdd-archive` native gate

## Why manual closure

Same root cause as the four prior archived cycles this project (`lifeos-foundation`,
`finance-budgets`, `finance-ui-polish`, `finance-recurring`): the `review-*` subagents in this
environment have no `Bash` tool, so `gentle-ai review inspect-candidate` (required to inspect the
frozen Git trees) can never run. See `openspec/changes/archive/lifeos-foundation/archive-report.md`
for the original detailed writeup.

## What shipped

Fulfills `lifeos-foundation`'s never-built "dashboard feed" (slice 5), re-scoped after
exploration confirmed two of its five original pieces (balance hero, due-recurring banner) had
already shipped in `finance-ui-polish`/`finance-recurring`. Home now shows, for the current
calendar month:

- **Month summary**: income and expense totals, transfers excluded.
- **Spending by category**: a CSS-only ranked bar list (no chart library), colors assigned by a
  deterministic FNV-1a hash of the category UUID — never render index/rank, so a category's color
  never changes just because its spend rank did.
- **Recent movements**: a bounded 4-item preview reusing `TransactionRow`, linking to
  `/movimientos` for the full list — transfers MAY appear here (they're real movements) even
  though they never count toward the totals above.
- The existing "Tus cuentas" accounts list moved below this new block (user-confirmed in scope
  mid-cycle — a real, deliberate UX change to a shipped screen, not an accidental reorder).

Two new `security_invoker` SQL views (`finance.month_summary`, `finance.category_spend`) back
these reads — the codebase's 5th and 6th occurrence of the `security_definer_view` footgun,
each with its own named pgTAP regression. Both use the identical `[month_start, month_start + 1
month)` window as `finance.budget_progress`, verified by a cross-view consistency test, so Home's
category totals can never silently disagree with `/presupuestos`' for the same period.

Delivered as a single PR (#22, merged to `main`) — the first change this session small enough not
to need a stacked chain.

## Deliberate architectural descoping

The original `lifeos-foundation` vision specified a card-provider registry (`getFeedCards(period)`)
so future modules (Health, Nutrition, etc.) could register dashboard cards without touching Home.
This change explicitly does NOT build that: LifeOS has exactly one real module today, and a
single-provider registry would be speculative abstraction against this project's own established
discipline. The `finance-recurring` "Más" nav-overflow precedent set the bar this project uses to
justify shared infrastructure — six *named, concrete* future consumers hitting a known IA
constraint — and a one-provider registry doesn't clear it. Home instead composes Finance data via
direct, typed repository calls. **Documented revisit trigger**: reconsider the registry once a
second module ships real screens, not on a vague "later."

## Verification

Per `verify-report.md` (sdd-verify agent, 2026-08-06): **PASS WITH WARNINGS**, 0 CRITICAL. All
evidence independently re-executed, not trusted from apply-time claims: `pnpm verify` clean,
148/149 `pnpm test` (the one pre-existing ESLint-subprocess flake, confirmed passing in
isolation), 161/161 pgTAP including both named `security_invoker` regressions and the
`budget_progress` cross-view consistency check. Zero new dependency
(`package.json`/`pnpm-lock.yaml` diff empty). Zero diff on Finance write paths — only new read
exports were added; `listRecentTransactions`'s new `options.postedOnly` parameter is additive and
every existing call site compiles and runs unchanged. Two authoring bugs (a pgTAP fixture missing
`voided_at`, two RTL selector over-matches) were found and fixed during real test execution, not
left as "should work."

**WARNINGs** (both minor, neither blocking): no dedicated 375px/light-dark *runtime* render test
for the three new cards specifically (static token-usage evidence only, not a live viewport
assertion); PR was open at verify time (resolved — merged after user review).

## Spec merge

- New capability `dashboard-home` (6 requirements) copied to `openspec/specs/dashboard-home/spec.md`.
- Delta merged into `openspec/specs/finance-transactions/spec.md`: the current-month aggregation
  read surface (income/expense totals, expense-by-category), explicitly read-only and additive.

## Outcome

Change `finance-dashboard-feed` is **complete and closed**. PR #22 merged to `main`. This closes
the last item of the Finance roadmap originally scoped in `lifeos-foundation` (core → budgets → UI
polish → recurring → dashboard feed). Per the user's explicit request, a consolidated pass over
accumulated polish/adjustment ideas from across this session's cycles is the planned next step,
not a new structural SDD change.

This folder moves to `openspec/changes/archive/finance-dashboard-feed/` as the closure record.
