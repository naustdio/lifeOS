# Tasks: Finance Dashboard Feed — Month Summary, Category Spend, Recent Movements

> Task IDs use the `F-` prefix (`F-001`..`F-013`) to avoid colliding with `T-` (`lifeos-foundation`),
> `B-` (`finance-budgets`), `R-` (`finance-recurring`), `P-` (`finance-ui-polish`). Each task cites the
> exact spec requirement(s) it satisfies via `dashboard-home/Requirement Name` or
> `finance-transactions/Requirement Name`. File paths mirror `design.md §9` (File Changes) exactly —
> every row in that table is covered by exactly one task here.
>
> **Migration prefix verified**: `supabase/migrations/` currently ends at `…090014_finance_recurring_api.sql`
> — design's assumed `…0015`/`…0016` numbering is correct. This change lands as
> `20260804090015_finance_dashboard.sql` and `20260804090016_finance_dashboard_security.sql`. Design's
> §9 open item is resolved, not deferred to `sdd-apply`.
>
> **User-confirmed scope addition** (this session, not a `design.md` deviation): the "Tus cuentas"
> accounts list moves **below** the three new cards, per `design.md §6`'s already-decided card order —
> F-009 implements this reordering and F-013 asserts the new DOM order.

## Grouping

- **(a) Migrations + pgTAP** — the two `security_invoker` views, grants, DB regression suite
- **(b) Repository + API** — `summary-repository.ts` extension, additive `listRecentTransactions` option, `finance/api` barrel
- **(c) Presentation patterns** — `MonthSummaryCard`, `CategorySpendList` + `categoryBarClass`
- **(d) Home composition** — `page.tsx` card order, reads, accounts-list reorder
- **(e) Unit + RTL render tests** — per `design.md §8`

See the Review Workload Forecast at the end for line estimates and the PR-count recommendation.

---

## (a) Migrations + pgTAP

- [x] F-001 Migration `supabase/migrations/20260804090015_finance_dashboard.sql` — `finance.month_summary` and `finance.category_spend` views (`design.md §2`).
  - **Acceptance**: both views MUST carry `with (security_invoker = true)` — the **fifth and sixth**
    occurrences of the `security_definer_view` footgun in this repo. Regular views only; materialized
    views do not honor RLS. This is a blocking defect if dropped, not a style note.
  - **Acceptance — window boundary**: both views MUST use the full `[date_trunc('month', current_date),
    date_trunc('month', current_date) + interval '1 month')` range, identical to `finance.budget_progress`
    — **NOT** capped at `current_date`. Capping would make `finance.category_spend` silently disagree
    with `/presupuestos`'s spend total for the same category and period.
  - **Acceptance**: `month_summary.expense_cents` and `category_spend.spent_cents` are positive
    magnitudes (`-t.amount_cents`, signed-convention negation), matching `budget_progress.spent_cents`.
  - **Acceptance**: `category_spend` filters `type = 'expense'` (excludes transfer and income in one
    predicate); `month_summary` filters `type <> 'transfer'`. Both filter `status = 'posted'`.
  - Satisfies: `finance-transactions/Current-Month Aggregation Read Surface` (both scenarios),
    `dashboard-home/Month Summary Card`, `dashboard-home/Spending-by-Category List` (ranking scenario).
  - Depends on: none (first migration in this change).
  - Parallel: sequential (must land before F-002/F-003).

- [x] F-002 Migration `supabase/migrations/20260804090016_finance_dashboard_security.sql` — `grant select` on both views (`design.md §2`).
  - **Acceptance**: `grant select on finance.month_summary to authenticated;` and
    `grant select on finance.category_spend to authenticated;` — load-bearing given migration 6's
    `alter default privileges … revoke all`; without these grants both views are unreadable even with
    correct RLS. `anon` remains ungranted.
  - Satisfies: `finance-transactions/Current-Month Aggregation Read Surface` (read-only surface).
  - Depends on: F-001.
  - Parallel: sequential.

- [x] F-003 pgTAP suite `supabase/tests/*_finance_dashboard.sql` per `design.md §8` (all DB rows).
  - **Acceptance — named `security_invoker` regressions (×2)**: a non-member session selecting
    `finance.month_summary` and, separately, `finance.category_spend` for a space with posted
    transactions this month returns **zero rows** in each case. Each test MUST fail if
    `with (security_invoker = true)` is dropped from its respective view — two distinct named tests,
    not one shared assertion.
  - **Acceptance — period boundary**: a posting dated the 1st at 00:00 of the current month is
    included; the last day of the previous month is excluded; the 1st of next month is excluded.
    Asserted relative to `current_date`, never a hardcoded date.
  - **Acceptance — transfer & void exclusion**: a posted transfer pair contributes zero to both
    `month_summary` totals and produces no `category_spend` row; a voided expense is excluded from
    both; income never leaks into `expense_cents`/`category_spend` and vice versa.
  - **Acceptance — sign & shape**: `expense_cents`/`spent_cents` are positive magnitudes;
    `category_spend` emits exactly one row per `(household_id, category_id)` with the correct
    `category_name`; a household with no qualifying rows yields zero rows (not a zero-valued row)
    from both views.
  - **Acceptance — cross-view consistency with budgets**: for a budgeted category,
    `category_spend.spent_cents` equals `budget_progress.spent_cents` for the same category and
    month — this pins the F-001 window-boundary decision so `/presupuestos` and Home can never
    disagree for the same period.
  - Satisfies: all `finance-transactions/Current-Month Aggregation Read Surface` scenarios,
    `dashboard-home/Month Summary Card`, `dashboard-home/Spending-by-Category List` (color/ranking
    excluded — DB-level only).
  - Depends on: F-001, F-002.
  - Parallel: yes, parallel with group (b)/(c) once F-001/F-002 land (test-only file, no app-code
    dependency).

---

## (b) Repository + API

- [x] F-004 `src/modules/finance/data/summary-repository.ts` (modify, extend) — `getMonthSummary`, `listCategorySpend` + `MonthSummary`/`CategorySpendRow` types (`design.md §3`).
  - **Acceptance**: same degrade-not-throw contract as `getHouseholdSummary` — a missing row or
    Supabase error resolves to `{ incomeCents: 0, expenseCents: 0 }` / `[]`, never a thrown error and
    never `NaN` downstream.
  - **Acceptance**: `Number()` applied to every `bigint`-backed column (`income_cents`,
    `expense_cents`, `spent_cents`), matching the shipped `budget-repository.ts`/`summary-repository.ts`
    shape.
  - **Acceptance**: `listCategorySpend` orders server-side (`.order("spent_cents", { ascending: false })`)
    so `limit` is a true top-N, not a client-truncated page.
  - Satisfies: `finance-transactions/Current-Month Aggregation Read Surface` (all three scenarios),
    `dashboard-home/Month Summary Card`, `dashboard-home/Spending-by-Category List` (ranking scenario).
  - Depends on: F-002 (needs the grants live to be meaningfully exercised/verified against).
  - Parallel: yes, parallel with (c) once F-002 lands.

- [x] F-005 `src/modules/finance/data/transaction-repository.ts` (modify) — additive `options: { postedOnly?: boolean } = {}` on `listRecentTransactions` (`design.md §3`).
  - **Acceptance — no signature break**: the new parameter is trailing, optional, and defaulted;
    every existing call site of `listRecentTransactions` (e.g. `/movimientos`) MUST compile and behave
    unchanged with zero call-site edits. Assert this explicitly (a grep/compile check or an existing
    test run) rather than assuming it from the diff shape.
  - **Acceptance**: `options.postedOnly` adds `.eq("status", "posted")` to the query builder before
    `.order()`; when omitted, behavior is byte-identical to today (posted **and** void rows returned,
    required by `/movimientos`'s correction display).
  - Satisfies: `dashboard-home/Recent Movements Preview` (both scenarios).
  - Depends on: none (pure repository extension, no new grant needed — reuses the existing table read).
  - Parallel: yes, parallel with F-004.

- [x] F-006 `src/modules/finance/api/index.ts` (modify) — add `getMonthSummary`, `listCategorySpend` + types to the existing read re-export block (`design.md §3`).
  - **Acceptance**: additive only — no existing export's signature or behavior changes; the file's
    leading `import "server-only"` statement is unchanged (design's explicit reasoning: no client
    component and no pre-submit gate exists in this change, so no third `api/` file is created).
  - Satisfies: `finance-transactions/Current-Month Aggregation Read Surface` (additive-exports
    scenario), `dashboard-home/No Write-Path Change` (zero-diff on write exports).
  - Depends on: F-004.
  - Parallel: sequential after F-004; may land alongside F-005's review since they touch disjoint
    files.

---

## (c) Presentation Patterns

- [x] F-007 `src/design-system/patterns/MonthSummaryCard.tsx` (`design.md §4.1`) — `Card` > `CardHeader`/`CardTitle` > two-column `CardContent`, income/expense `MoneyAmount` cells.
  - **Acceptance**: `React.forwardRef`, `cn`, semantic tokens only (no raw hex — `check-tokens.mjs`
    gate); no `"use client"` (pure presentational, server-renderable).
  - **Acceptance**: renders the `EmptyState` (per `design.md §7` table: icon `CalendarRange`, heading
    "Aún no hay movimientos este mes", CTA linking to `/movimientos`) when
    `incomeCents === 0 && expenseCents === 0`, never a bare `0`/`NaN` layout.
  - Satisfies: `dashboard-home/Month Summary Card`, `dashboard-home/Explicit Empty States` (both
    scenarios), `dashboard-home/Mobile-First, Light and Dark`.
  - Depends on: none (pure presentational, prop-only).
  - Parallel: yes, parallel with F-008 and group (b).

- [x] F-008 `src/design-system/patterns/CategorySpendList.tsx` incl. exported `categoryBarClass` (`design.md §4.2`).
  - **Acceptance — color keyed by hash, not index/rank**: `categoryBarClass(categoryId)` MUST compute
    an FNV-1a-style hash of the category UUID (`h = 2166136261`, `h ^= charCode`, `h = Math.imul(h,
    16777619)` per character, `CATEGORY_BAR_CLASSES[Math.abs(h) % 6]`) and MUST NOT accept or use a
    render index/rank as its color key. A unit test (F-010) asserts the same category id yields the
    same class even when its rank in the list changes between renders.
  - **Acceptance**: the six-entry `CATEGORY_BAR_CLASSES` palette uses only already-approved token
    classes with opacity modifiers (`bg-primary`, `bg-accent-brand`, and their `/70`/`/45` variants) —
    no new token, no hex, and `income`/`expense` tokens are excluded from the palette.
  - **Acceptance — divide-by-zero guard**: `pct = maxCents > 0 ? Math.max(2, Math.round((spentCents /
    maxCents) * 100)) : 0` — mirrors `ProgressBar`'s guard; a 1-cent item against a large top item
    renders as a 2% sliver, never a 0-width bar; `maxCents === 0` never produces `NaN`.
  - **Acceptance**: track `<div>` carries `aria-hidden`; no `role="progressbar"` (deliberately unlike
    `ProgressBar` — these bars encode relative magnitude, not progress toward a limit).
  - **Acceptance**: renders the `EmptyState` (icon `PieChart`, heading "Sin gastos por categoría", no
    action) when `items.length === 0`.
  - Satisfies: `dashboard-home/Spending-by-Category List` (both scenarios, including color stability),
    `dashboard-home/Explicit Empty States` (both scenarios), `dashboard-home/Mobile-First, Light and
    Dark`.
  - Depends on: none (pure presentational, prop-only; forks no `ProgressBar` props).
  - Parallel: yes, parallel with F-007 and group (b).

---

## (d) Home Composition

- [x] F-009 `src/app/(app)/page.tsx` (modify) — new card order, two additive reads, accounts-list reorder (`design.md §6`).
  - **Acceptance — card order**: `MonthSummaryCard` → `CategorySpendList` → recent-movements `Card`
    (`Card` + `TransactionRow` × 4 + `Link href="/movimientos"` "Ver todos", composed inline, no new
    pattern component per `design.md §5`) — this block sits between the conditional debt `Card` and
    the accounts `Card`/`EmptyState`, exactly per `design.md §6`'s ordering diagram.
  - **Acceptance — accounts reorder (user-confirmed, in scope)**: the "Tus cuentas" accounts
    `Card`/`EmptyState` moves to render **after** the three new cards, immediately before the
    savings-goal cards. This is a real DOM-order change from Home's current shipped layout, not a
    no-op.
  - **Acceptance**: `getMonthSummary`, `listCategorySpend`, and `listRecentTransactions(supabase,
    householdId, 4, { postedOnly: true })` join the existing `Promise.all` — 5 parallel reads instead
    of 3, no new round trip in series.
  - **Acceptance**: the recent-movements `TransactionRow`s use `kind={t.amountCents >= 0 ? "income" :
    "expense"}` on the leg's own sign (not `type`), so a transfer row renders without special-casing;
    the transfer never reaches `MonthSummaryCard`/`CategorySpendList` totals because those come from
    F-001's views, which exclude it in SQL.
  - Satisfies: `dashboard-home/Month Summary Card`, `dashboard-home/Spending-by-Category List`,
    `dashboard-home/Recent Movements Preview` (both scenarios, incl. transfer-as-row), `dashboard-home/
    Explicit Empty States` (partial-month independence scenario), `dashboard-home/No Write-Path
    Change`.
  - Depends on: F-004, F-005, F-006, F-007, F-008.
  - Parallel: sequential (last implementation task — composes everything above it).

---

## (e) Unit + RTL Render Tests

- [x] F-010 Vitest `tests/unit/category-spend-color.test.ts` per `design.md §8`.
  - **Acceptance — rank-independence**: same UUID yields the same `categoryBarClass` output across two
    calls; the same assertion repeated after re-ordering an input array by spend rank, proving the
    color key is the UUID hash, not the render index/rank.
  - Also per `design.md §8`: output is always a member of `CATEGORY_BAR_CLASSES`; distinct UUIDs spread
    across the palette; empty string does not throw; the returned class never contains `#` (token-only
    regression).
  - Also: bar-percentage pure logic — top item ⇒ 100; half the top ⇒ 50; a 1-cent item against a large
    top ⇒ 2, never 0; `maxCents === 0` ⇒ 0 and never `NaN`; an empty list yields no bars.
  - Satisfies: `dashboard-home/Spending-by-Category List` (color-stability scenario, unit level).
  - Depends on: F-008.
  - Parallel: yes, parallel with F-011/F-012.

- [x] F-011 RTL `tests/unit/month-summary-card-render.test.tsx` per `design.md §8`.
  - Renders both formatted figures with income/expense token treatment and the month label; the
    zero/zero branch renders the `EmptyState` heading and its CTA links to `/movimientos`.
  - Satisfies: `dashboard-home/Month Summary Card`, `dashboard-home/Explicit Empty States`.
  - Depends on: F-007.
  - Parallel: yes, parallel with F-010/F-012.

- [x] F-012 RTL `tests/unit/category-spend-list-render.test.tsx` per `design.md §8`.
  - Three items render highest-first with three bars whose inline `width` is descending, the top bar
    is `100%`, no `NaN`/`undefined` in any style attribute, the same category id yields the same class
    in two separate renders, and the empty list renders the `EmptyState`, never a bar.
  - Satisfies: `dashboard-home/Spending-by-Category List` (both scenarios), `dashboard-home/Explicit
    Empty States`.
  - Depends on: F-008.
  - Parallel: yes, parallel with F-010/F-011.

- [x] F-013 RTL `tests/unit/home-page-render.test.tsx` (modify — extend the shipped file) per `design.md §8`.
  - **Acceptance — DOM order, incl. the accounts reorder**: populated fixture asserts the three new
    cards appear in the design-§6 order, between the debt card and the accounts card, **and** that the
    accounts `Card`/`EmptyState` now renders after all three (not in its pre-change position) — assert
    on DOM order via `compareDocumentPosition` or query-order, not just presence.
  - **Acceptance**: the recent-movements preview shows exactly 4 rows with a `/movimientos` link.
  - **Acceptance — empty**: all three new cards render their own `EmptyState`; the document contains no
    `NaN` and no orphan `0%`.
  - **Acceptance — mixed/partial month**: income-only fixture renders real summary totals **and** the
    category-spend `EmptyState` simultaneously (independent per-card empty check, not a shared flag).
  - **Acceptance — transfer**: a transfer among the recent rows appears as a preview row while the
    summary totals are unchanged by it.
  - Satisfies: `dashboard-home/Month Summary Card`, `dashboard-home/Spending-by-Category List`,
    `dashboard-home/Recent Movements Preview` (both scenarios), `dashboard-home/Explicit Empty States`
    (both scenarios), `dashboard-home/Mobile-First, Light and Dark`.
  - Depends on: F-009.
  - Parallel: sequential (last task — exercises all of group (d)).

---

## Review Workload Forecast

Cached session review budget: **1000 changed lines** (raised from 800 during `finance-ui-polish`).
Estimates below are rough LOC per task including migrations, TS, and tests.

| Group | Tasks | Est. changed lines | Budget risk (1000-line threshold) |
|---|---|---|---|
| (a) Migrations + pgTAP | F-001, F-002, F-003 | ~230–290 (40 view DDL + 10 grants + 180–240 pgTAP: 2 named invoker regressions + boundary + transfer/void + sign/shape + budget-consistency) | Comfortably under budget alone. |
| (b) Repository + API | F-004, F-005, F-006 | ~75–105 (55–70 repository + 10–15 additive option + 10–20 barrel) | Trivially under budget. |
| (c) Patterns | F-007, F-008 | ~110–150 (40–60 `MonthSummaryCard` + 70–90 `CategorySpendList`+hash+bars) | Under budget. |
| (d) Home composition | F-009 | ~60–90 (2 reads in `Promise.all`, accounts reorder, 3-card composition, inline recent-movements card) | Trivially under budget. |
| (e) Unit + RTL tests | F-010, F-011, F-012, F-013 | ~230–340 (40–60 + 50–70 + 60–90 + 80–120, the last extending an existing file) | Under budget alone. |

**Total estimated change**: ~705–975 lines across the whole slice — **under the 1000-line session
budget as a single PR**, unlike `finance-recurring`'s ~2350–2960-line, 4-PR cycle. This change is
meaningfully smaller: two views instead of a table+triggers+two-seam-functions, no new screen, and
two small patterns instead of a full CRUD form. Design's own §9 size note assumed the stale 400-line
budget, not this session's cached 1000; reforecast against the real budget removes the two-slice
split it flagged as a contingency.

**Recommendation: 1 PR.** Even the estimate's upper bound (~975 lines) sits under 1000 with room to
spare, and every group is tightly coupled to the next (views → repository → patterns → composition →
tests, each unlocking the next). Splitting would trade review clarity on a change this size for
chain-management overhead with no budget benefit. If implementation verbosity pushes the pgTAP suite
(F-003) or the render-test group (e) meaningfully past their upper estimates, the design's original
two-slice boundary remains available as a fallback: (a)+(b) migrations/repositories vs. (c)+(d)+(e)
patterns/composition/tests — flag this to the user only if actual line counts approach 1000 during
`sdd-apply`, consistent with `delivery_strategy = ask-on-risk`.

Delivery strategy: ask-on-risk. Chain strategy: stacked-to-main (single PR onto `main`, no chain
needed at this size).

---

## Dependency Summary (critical path)

```
F-001 (views) → F-002 (grants) → F-003 (pgTAP)                          [F-003 parallel with (b)/(c)]
F-002 → F-004 (summary-repository)
F-004 → F-006 (api barrel)                                              [parallel with F-005]
F-005 (transaction-repository, no DB dep)                               [parallel with F-004]
F-007 (MonthSummaryCard, pure)                                          [parallel with F-004–F-006]
F-008 (CategorySpendList + categoryBarClass, pure)                      [parallel with F-004–F-007]
F-004, F-005, F-006, F-007, F-008 → F-009 (Home composition, last impl task)
F-008 → F-010 (color/percentage unit tests)                             [parallel with F-011/F-012]
F-007 → F-011 (MonthSummaryCard render)                                 [parallel with F-010/F-012]
F-008 → F-012 (CategorySpendList render)                                [parallel with F-010/F-011]
F-009 → F-013 (Home render, last — exercises all of (d))
```

Testing tasks (F-003, F-010, F-011, F-012, F-013) accompany the logic they test rather than gating
every prior task, per `design.md §8`'s testing strategy table.
</content>
