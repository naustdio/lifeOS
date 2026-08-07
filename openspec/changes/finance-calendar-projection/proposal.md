# Proposal: Finance Calendar — Day-by-Day Balance Projection

## Intent

Today the app answers "what is my balance **now**" (`finance.household_summary.available_cents`) and "what is **already** due" (`finance.recurring_due`, `next_due_date <= current_date`). Nothing answers **"what will my balance be on the 20th, and do I run out before payday?"** A user with rent, subscriptions and loan payments can only find that out by mentally adding up `/recurrentes`. This change ships a calendar view that walks today's balance forward day by day across scheduled recurring charges, so the user *sees the dip before it happens* instead of discovering it at the ATM.

## Scope

### In Scope
- New `(app)/calendario/` route: month calendar grid + selected-day detail list.
- New pure domain function in `src/modules/finance/domain/recurring.ts` — `projectOccurrences(definitions, fromDate, days)` — rolling each active definition forward with the existing `nextDueDate()`, with its **own** day-range and iteration cap (default **90 days**, hard iteration ceiling per definition).
- Day-by-day running balance: day 0 = `getHouseholdSummary().availableCents`; each day subtracts that day's projected charges.
- New calendar-grid design-system pattern (CSS grid, built from scratch), day cells marked with charge presence and with the first day the projection goes **negative**.
- Unit tests for the projection function (frequency mix, month-end clamp, cap behavior, empty input).

### Out of Scope
- **Manual future-dated transactions.** `finance.transactions.occurred_on` has no upper bound (DB, RPC, zod and the `<input type="date">` all permit it), so users *can* already record a future movement — this change deliberately does **not** surface them. Additive later; no schema change needed.
- **Savings-goal projection.** `finance.account_goal_details.target_date` stays orphaned.
- Any new migration, view, RPC, or write path. This feature is **100% read-only**.
- Any new npm dependency (no date-fns/dayjs/react-day-picker).
- Editing, confirming or discarding a recurring charge from the calendar; drag-to-reschedule; multi-month/12-month horizon; per-account projection.

## Business Rules

| Rule | Decision |
|---|---|
| Sources | **Recurring definitions only** (`active = true`). Paused definitions are excluded entirely. |
| Day 0 anchor | `household_summary.available_cents` (asset accounts only; `debt_cents` never subtracted — design.md §3.3). |
| Direction | Recurring confirm always posts `type = 'expense'` with `-abs(amount)` (`20260804090014` line 47). There is **no recurring income**, so the curve only descends. UI must read as "projected outflows", never as a full cashflow forecast. |
| Due today | Counts **in today's cell** and reduces today's closing balance — it is unposted money still leaving. |
| Overdue (`next_due_date < today`) | Folded into day 0 rather than dropped, so the projection is never optimistic. |
| Horizon | 90 days forward from today, capped; a weekly definition yields ~13 occurrences, bounded by construction. |
| Empty state | No active definitions → flat line at today's balance, not an error or blank grid. |

## Capabilities

### New Capabilities
- `finance-calendar`: read-only day-by-day projected balance calendar — window, anchor, inclusion rules, negative-day surfacing, empty state.

### Modified Capabilities
- `finance-recurring`: the domain layer MUST expose a bounded multi-occurrence projection (distinct from `nextFutureDueDate()`, which returns a single next occurrence).

## Approach

**Client-computed, zero migrations.** Fetch `getHouseholdSummary()` + `listRecurringDefinitions()` (both already exist, unchanged), roll forward with the already-pure, UTC-safe `nextDueDate()` (lines 45–67), reduce into a per-day map, render.

**Documented architectural deviation.** Every other derived number in this codebase is a Postgres view with `security_invoker = true` (`account_balances`, `household_summary`, `month_summary`, `category_spend`, `recurring_due`). This projection computes **client-side** instead. That is a **conscious tradeoff**, not an oversight: a SQL projection needs `generate_series` + recursive date rolling and a new migration, while the client cost is trivial for realistic per-household definition counts. Escalate to a view/RPC only if performance or a server-side merge with manual future transactions demands it. Design must record this explicitly.

**Effort lives in the UI, not the math.** The projection reuses proven pure functions; the calendar grid is greenfield (no calendar pattern among the 13 existing `design-system/patterns`, no date library in `package.json`).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/modules/finance/domain/recurring.ts` | Modified | New pure `projectOccurrences()` + explicit cap |
| `src/modules/finance/data/summary-repository.ts` | Unchanged | `getHouseholdSummary()` consumed as day-0 anchor |
| `src/modules/finance/data/recurring-repository.ts` | Unchanged | `listRecurringDefinitions()` consumed as-is |
| `src/design-system/patterns/` | New | Calendar grid + day cell |
| `src/app/(app)/calendario/` | New | Calendar route + day detail |
| `supabase/migrations/` | Unchanged | Zero new migrations |
| `src/modules/finance/api/` | Unchanged | Read-only feature, no seam change |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Runaway loop projecting weekly/biweekly far forward | Med | Explicit 90-day window **and** per-definition iteration ceiling; unit-tested |
| Users read the descending curve as a real forecast (no income modeled) | High | Label as projected outflows; show the anchor date and horizon in the UI |
| Client-compute deviation mistaken for an oversight by a later reviewer | Med | Recorded in this proposal and required in `design.md` |
| Calendar grid scope-creeps into scheduling/editing | Med | Read-only is a hard boundary; no write path added |
| Month-end drift surprises (Jan 31 → Feb 28 → Mar 28) | Low | Inherited, intentional `nextDueDate()` behavior (design.md §10 Decision 5); assert it in tests |
| Mobile calendar grid unusable at 375px | Med | Grid + day-detail list below, not a wide desktop-only table |
| 400-line review budget exceeded (domain + pattern + route) | Med | Flag to `sdd-tasks`: slice as domain+tests → design-system pattern → route |

## Rollback Plan

Fully additive and read-only. Revert = delete `src/app/(app)/calendario/`, delete the new calendar pattern, remove `projectOccurrences()` and its tests, drop the nav entry. No migration to reverse, no row mutated, no existing function signature changed, `finance/api` diff is zero. Rolling back cannot corrupt data because the feature never writes.

## Dependencies

- `finance.recurring_transactions`, `finance.household_summary`, `nextDueDate()` — all present and unchanged.
- No new npm package.
- Independent of change #1 (`finance-categories-icon-color`); if that merges first, day-detail rows may optionally reuse the styled `CategoryChip`, but the calendar must not require it.

## Success Criteria

- [ ] Opening `/calendario` shows today's available balance as day 0 and a projected closing balance for every day in the window.
- [ ] A recurring charge due today appears in today's cell and is subtracted from today's closing balance.
- [ ] An overdue definition still reduces the projection instead of being silently ignored.
- [ ] A paused (`active = false`) definition never appears in any day cell.
- [ ] The first day the projected balance goes negative is visually surfaced.
- [ ] A household with zero active definitions sees a flat projection, not an error or blank grid.
- [ ] Monthly definitions anchored on the 31st clamp correctly across February.
- [ ] No migration is added; `supabase/migrations/` and `src/modules/finance/api/` show zero diff.
- [ ] `package.json` shows zero new dependencies.
- [ ] Usable at 375px; `pnpm verify` passes.
