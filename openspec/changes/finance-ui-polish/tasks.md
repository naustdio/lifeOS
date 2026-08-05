# Tasks: Finance UI Polish

> Task IDs use the `P-` prefix (`P-001`..`P-018`) to avoid colliding with `T-` (lifeos-foundation)
> and `B-` (finance-budgets) IDs. Grouping follows the design's own suggested rollout order
> (`design.md` — Migration / Rollout): (a) new patterns + unit tests, (b) base `ui/` interaction
> states, (c) screen adoption + empty states, (d) new screen RTL tests. Each task cites the exact
> spec requirement(s) it satisfies via `finance-ui-polish/Requirement Name`. File paths mirror
> `design.md` — File Changes exactly.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950–1350 across 4 groups |
| 400-line budget risk | High (cached session budget is 800, not 400) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (a) → PR 2 (b) → PR 3 (c) → PR 4 (d) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Land 4 new `patterns/` components + unit tests, additive only | PR 1 | `pnpm vitest run tests/unit/pattern-*.test.tsx` | N/A — pure presentational units, no server/DB path | Delete 4 new files; zero screen touches to unwind |
| 2 | Add hover/active states to `ui/{button,card,chip,nav-pill}` + nav links | PR 2 | `pnpm vitest run tests/unit/*-form-render.test.tsx` (regression) | N/A — Tailwind class-only diff, no runtime scenario | Revert class changes; PR 1 components unaffected |
| 3 | Screen adoption on Home/Cuentas/Movimientos/Presupuestos + empty states | PR 3 | `pnpm vitest run tests/unit/*-form-render.test.tsx` | Manual: load each of the 4 routes at 375px, light+dark, zero-data and populated fixtures | Revert 8 screen files; PR 1/2 components remain valid unused exports |
| 4 | New RTL render tests for Home/Cuentas/Movimientos list screens | PR 4 | `pnpm vitest run tests/unit/home-page-render.test.tsx tests/unit/accounts-page-render.test.tsx tests/unit/movements-list-render.test.tsx` | N/A — RTL test-only, exercises PR 3's rendered output | Delete 3 new test files; no production code depends on them |

Est. lines: (a) ~260–360, (b) ~60–90, (c) ~480–680, (d) ~150–220. Total risks crossing the cached
800-line single-PR budget comfortably, so the 4-slice stacked chain above is required. **Decision
needed**: confirm the stacked-to-main 4-PR order before `sdd-apply` begins PR 1.

---

## Group (a): New Pattern Components + Unit Tests

- [x] P-001 Create `src/design-system/patterns/TransactionRow.tsx` per `design.md` Component Contracts — borderless row, `RowAvatar` icon-circle leading slot, `MoneyAmount` trailing slot, `muted` opacity state.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns` (transaction row scenario).
  - Depends on: none.
  - Parallel: yes, with P-002/P-003/P-004.
- [x] P-002 Create `src/design-system/patterns/ProgressBar.tsx` — `valueCents`/`limitCents` props, `Math.min(100, ...)` clamp, `limitCents === 0` guard, `role="progressbar"` a11y attrs, `bg-expense`/`bg-primary` at-or-over color.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns` (progress bar scenario), `finance-ui-polish/Polished Empty States` (zero-progress fill scenario).
  - Depends on: none.
  - Parallel: yes.
- [x] P-003 Create `src/design-system/patterns/QuickActionRow.tsx` — `QuickAction[]` prop (`label, icon, href`), 3 default real-route actions (`/movimientos`, `/cuentas/nueva`, `/presupuestos`), circular icon buttons with `hover:scale-105 active:scale-95`.
  - Satisfies: `finance-ui-polish/Quick Action Row Contains Only Real Destinations` (both scenarios), `finance-ui-polish/Interaction States on Interactive Elements`.
  - Depends on: none.
  - Parallel: yes.
- [x] P-004 Create `src/design-system/patterns/EmptyState.tsx` — shared icon/heading/muted-line/CTA block per `design.md` Empty States table, `Card`+`CardContent` shell.
  - Satisfies: `finance-ui-polish/Polished Empty States` (both scenarios).
  - Depends on: none.
  - Parallel: yes.
- [x] P-005 Unit tests `tests/unit/pattern-progress-bar.test.tsx` — clamps to 100%, at/over-limit color+aria, `limitCents === 0` survives without NaN/divide-by-zero.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States`.
  - Depends on: P-002.
  - Parallel: yes, with P-006/P-007.
- [x] P-006 Unit tests `tests/unit/pattern-transaction-row.test.tsx` — renders title/subtitle/formattedAmount and `trailing` slot; `muted` reduces opacity.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`.
  - Depends on: P-001.
  - Parallel: yes.
- [x] P-007 Unit tests `tests/unit/pattern-quick-action-row.test.tsx` — one `getByRole("link")` per action with expected `href`; no disabled/placeholder items render.
  - Satisfies: `finance-ui-polish/Quick Action Row Contains Only Real Destinations` (both scenarios).
  - Depends on: P-003.
  - Parallel: yes.

## Group (b): Base `ui/` Interaction States

- [x] P-008 `src/design-system/ui/button.tsx` — base class `transition-colors` → `transition-all duration-200 ease-out active:scale-95`; `ghost` variant gains `active:bg-accent`.
  - Satisfies: `finance-ui-polish/Interaction States on Interactive Elements` (both scenarios).
  - Depends on: none.
  - Parallel: yes, with P-009/P-010/P-011.
- [x] P-009 `src/design-system/ui/card.tsx` — drop `border border-border` (Decision 8); no new variant, interactivity stays caller-`className`-only.
  - Satisfies: `finance-ui-polish/No New Raw Token Values`, `finance-ui-polish/Interaction States on Interactive Elements`.
  - Depends on: none.
  - Parallel: yes.
- [x] P-010 `src/design-system/ui/chip.tsx` — add `transition-colors duration-200 ease-out`.
  - Satisfies: `finance-ui-polish/Interaction States on Interactive Elements`.
  - Depends on: none.
  - Parallel: yes.
- [x] P-011 `src/design-system/ui/nav-pill.tsx` + `src/app/(app)/layout.tsx` — nav `<Link>`s get `rounded-pill px-3 py-1.5 transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10`.
  - Satisfies: `finance-ui-polish/Interaction States on Interactive Elements`.
  - Depends on: none.
  - Parallel: yes.

## Group (c): Screen Adoption + Empty States

- [x] P-012 `src/design-system/patterns/BalanceHero.tsx` (modify) + `src/design-system/patterns/CategoryChip.tsx` (modify) — tighter label tracking, optional `footer` slot for `QuickActionRow` adjacency; `CategoryChip` transition added, stays inline-tag-only.
  - Satisfies: `finance-ui-polish/Interaction States on Interactive Elements`, `finance-ui-polish/No New Raw Token Values`.
  - Depends on: P-003, P-010.
  - Parallel: yes, with P-013 prep but sequential before P-013 consumes the `footer` slot.
- [x] P-013 `src/app/(app)/page.tsx` (Home) — replace ad hoc account row with `TransactionRow`; mount `QuickActionRow` below `BalanceHero`; wire `EmptyState` for zero accounts.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Quick Action Row Contains Only Real Destinations`, `finance-ui-polish/Polished Empty States`.
  - Depends on: P-001, P-003, P-004, P-012.
  - Parallel: yes, with P-014/P-015/P-016/P-017 (disjoint files).
- [x] P-014 `src/app/(app)/cuentas/page.tsx` — replace per-account `Card` with `TransactionRow`; replace percentage text with `ProgressBar`; wire `EmptyState` for zero accounts.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States`.
  - Depends on: P-001, P-002, P-004.
  - Parallel: yes.
- [x] P-015 `src/app/(app)/movimientos/page.tsx` — replace per-transaction `Card` with `TransactionRow`; wire `EmptyState` for zero movements.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States`.
  - Depends on: P-001, P-004.
  - Parallel: yes.
- [x] P-016 `src/app/(app)/movimientos/TransactionForm.tsx` — segmented tab pill polish + transitions only, no behavior change.
  - Satisfies: `finance-ui-polish/Interaction States on Interactive Elements`, `finance-ui-polish/Presentation-Only Change Boundary`.
  - Depends on: P-008, P-010.
  - Parallel: yes.
- [x] P-017 `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` — spacing/heading polish only, no behavior change.
  - Satisfies: `finance-ui-polish/Interaction States on Interactive Elements`, `finance-ui-polish/Presentation-Only Change Boundary`.
  - Depends on: P-008.
  - Parallel: yes.
- [x] P-018 `src/app/(app)/presupuestos/BudgetForm.tsx` — consume `ProgressBar` in place of the inline percentage math; wire `EmptyState` for zero expense categories; 0%-progress budget renders `ProgressBar`'s zero-fill state, not an empty state.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States` (both scenarios).
  - Depends on: P-002, P-004.
  - Parallel: yes.

## Group (d): Screen RTL Render Tests

> **Risk — flagged explicitly**: `design.md` Testing Strategy notes Home/Cuentas/Movimientos are
> async Server Components with `server-only`/`next/cache`/Supabase imports, the same challenge the
> exploration originally deferred. Resolution approach to pick per test, mirroring
> `tests/unit/account-form-render.test.tsx`: either (i) extract a presentational subtree that takes
> resolved view-model props and render that directly, or (ii) `await` the invoked async page
> function to get its returned element and render that element with RTL, mocking `server-only`,
> `next/cache`, `next/navigation`, and `@/shared/supabase/server` exactly as the existing form-render
> tests do. Each task below must record which approach it used.

- [ ] P-019 `tests/unit/home-page-render.test.tsx` — populated (accounts + `QuickActionRow` + `TransactionRow` list) and empty (zero accounts → `EmptyState`) renders; text/label/role assertions only, zero className assertions.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States`, `finance-ui-polish/Quick Action Row Contains Only Real Destinations`.
  - Depends on: P-013.
  - Parallel: yes, with P-020/P-021.
- [ ] P-020 `tests/unit/accounts-page-render.test.tsx` — populated (`TransactionRow` list + `ProgressBar`) and empty (zero accounts → `EmptyState`) renders.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States`.
  - Depends on: P-014.
  - Parallel: yes.
- [ ] P-021 `tests/unit/movements-list-render.test.tsx` — populated (`TransactionRow` list) and empty (zero movements → `EmptyState`) renders.
  - Satisfies: `finance-ui-polish/Shared Presentation Patterns`, `finance-ui-polish/Polished Empty States`.
  - Depends on: P-015.
  - Parallel: yes.
- [ ] P-022 Regression pass: run existing 4 `*-form-render.test.tsx` unchanged; run `pnpm verify` (`scripts/check-tokens.mjs`, ESLint boundaries, `tsc --noEmit`); confirm `git diff` on `src/modules/finance/**` is empty.
  - Satisfies: `finance-ui-polish/Presentation-Only Change Boundary`, `finance-ui-polish/No New Raw Token Values`.
  - Depends on: P-019, P-020, P-021.
  - Parallel: no — final gate task.

---

## Dependency Summary (critical path)

```
P-001..P-004 (patterns)  →  P-005..P-007 (pattern unit tests)         [group a]
P-008..P-011 (ui/ states)                                              [group b, parallel with a]
P-001..P-004, P-010 → P-012 (BalanceHero/CategoryChip)
P-012, P-001..P-004, P-008 → P-013..P-018 (screen adoption)            [group c]
P-013 → P-019, P-014 → P-020, P-015 → P-021                            [group d]
P-019, P-020, P-021 → P-022 (final regression + verify gate)
```

Group (d) render-test tasks are proving tasks for group (c), not TDD gates — they land after their
screen, per the design's own rollout order.
