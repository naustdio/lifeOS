# Proposal: Finance Dashboard Feed — Month Summary, Category Spend, Recent Movements

## Intent

`lifeos-foundation` promised a Home "dashboard feed" (slice 5) and never built it. Two of its five
pieces already shipped: the balance hero (`BalanceHero`) and the due-recurring banner
(`DueRecurringBanner`). Home today answers *"how much do I have?"* but not *"where did it go this
month?"* — the owner must open `/movimientos` and scan rows to learn that. This change closes the
gap with three read-only Home cards over the current calendar month.

## Scope

### In Scope

- **Month summary card**: income and expense totals for the current calendar month (day 1 → today),
  transfers excluded.
- **Spending-by-category**: CSS-only ranked bar list of expense totals per category for the same
  period, extending the `ProgressBar` width-percentage technique (no chart library).
- **Recent movements preview**: 3–5 most recent posted transactions with a link to `/movimientos`.
- Supporting read-only query/queries in `finance/data` exposed through `finance/api`.

### Out of Scope (non-goals)

- **The card-provider registry (`getFeedCards(period)`) from `lifeos-foundation`** — see Approach.
- Any new UI dependency (charting, animation), schema column (e.g. `categories.color`), or write path.
- Rolling windows, month switching, multi-month trends, drill-down screens, budget re-display.
- Duplicating `/movimientos`: the preview complements it, never replaces its list.

## Capabilities

### New Capabilities

- `dashboard-home`: Home composition and its month-scoped Finance cards. Supersedes the unimplemented
  `dashboard-feed` capability declared in `lifeos-foundation` (no `openspec/specs/dashboard-feed/`
  was ever written).

### Modified Capabilities

- `finance-transactions`: adds read-only current-month aggregation (income/expense totals, expense
  totals grouped by category) to the module's public read surface. No write behavior changes.

## Approach

**Direct typed composition, not a plugin registry.** `lifeos-foundation` designed the feed as a
contract each module registers into. Deliberately descoped: LifeOS has exactly one real module, so a
single-provider registry is speculative abstraction. The `finance-recurring` "Más" nav precedent set
this project's bar — it was justified by six *named, concrete* future consumers hitting a known IA
constraint; one provider does not clear it. Home instead calls typed Finance repository functions
directly. **Revisit when a second module ships real screens** — that is the trigger, not a vague
"later".

**Period = current calendar month (1st → today)**, matching how `finance-budgets` already scopes
monthly progress. One mental model app-wide, not a rolling 30 days.

**No new data infrastructure assumed.** `finance.household_summary` exposes only
`available_cents`/`debt_cents`; no period or category aggregation exists. Whether this needs a
`security_invoker` view/RPC or plain JS aggregation over an indexed query is a **design-phase**
decision. The shipped index `finance.transactions (household_id, category_id, occurred_on) where
status='posted' and type<>'transfer'` already supports the category+range read.

**Category colors are client-side.** `finance.categories` has no `color` column; use a deterministic
token-palette rotation keyed by category id/index rather than a migration.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/app/(app)/page.tsx` | Modified | Compose three new cards below the existing hero/quick actions/banner |
| `src/modules/finance/data/` | New | Month-summary + category-breakdown reads |
| `src/modules/finance/api/index.ts` | Modified | Additive read exports only |
| `src/design-system/patterns/` | New | `MonthSummaryCard`, `CategorySpendList` (forwardRef + `cn` + semantic tokens) |
| `supabase/migrations/` | Possibly New | Only if design chooses a view/RPC over JS aggregation |
| `tests/unit/` | New | Aggregation unit tests + Home render tests |

## Cross-Module Flag

Per `config.yaml`: Finance is the base module. Nothing here makes another module depend on Finance —
but **descoping the card-provider registry is itself the cross-module decision**. Home is now coupled
to Finance by construction; Health/Nutrition cannot appear on Home without either revisiting the
registry or adding a second direct call. Documented here so a future module reads a reasoned
tradeoff, not a silent gap.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Home render slows (3 more queries) | Med | Single `Promise.all` with existing reads; prefer one aggregation query per card, not per category |
| A chart library sneaks in | Low | Explicit non-goal; `pnpm verify` + review gate on `package.json` diff |
| Category bar list duplicates `/presupuestos` visuals | Med | Reuse `ProgressBar` mechanics; spend list is un-budgeted actuals, ranked, no limits |
| Descoped registry becomes a costly retrofit | Low | Home composition stays a thin server component; cards are prop-only patterns and are registry-portable |
| Transfers double-count as expense | Low | Reuse the shipped `type<>'transfer'` exclusion rule; assert in tests |
| Empty/partial month (no transactions yet) | Med | Explicit empty states via the shipped `EmptyState`, spec'd not improvised |

## Rollback Plan

Presentation + read-only, so rollback is a revert. UI down path: remove the three cards from
`page.tsx` and delete the new `patterns/` files — Home returns byte-for-byte to its current shape.
Data down path: the new `finance/api` read exports are additive and unreferenced once the UI is gone.
If design lands a view/RPC, its down path is `drop view/function if exists` only — no table, column,
constraint, or row is created or mutated, so the ledger cannot be damaged. The two halves are
independent; either can be reverted alone.

## Dependencies

None new. Builds on shipped `lifeos-foundation`, `finance-budgets`, `finance-recurring`, and
`finance-ui-polish` work. No package additions.

## Success Criteria

- [ ] Home shows current-month income and expense totals, matching a hand count of posted
      non-transfer transactions from the 1st through today.
- [ ] Spending-by-category renders as ranked CSS bars, visually distinguishable per category, with no
      new dependency in `package.json`.
- [ ] Recent movements shows 3–5 transactions and links to `/movimientos`.
- [ ] Transfers appear in none of the three cards.
- [ ] A space with zero transactions renders empty states, never `NaN`, `0%` artifacts, or blank cards.
- [ ] Usable at 375px in light and dark; `pnpm verify` passes (tokens, boundaries, `tsc`, build).
- [ ] `src/modules/finance/**` write paths show zero diff.

## Proposal question round

Not run interactively — the three product decisions that would have driven it (no registry, bounded
recent-movements preview, calendar-month period) were confirmed by the user before this phase and are
recorded above as decided, not assumed. Open items are deliberately routed to `sdd-design`:
(1) aggregation in SQL view/RPC vs. JS; (2) exact preview count (3, 4, or 5); (3) card order on Home.
