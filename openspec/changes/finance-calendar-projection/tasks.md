# Tasks: Finance Calendar — Day-by-Day Balance Projection

> Task IDs use the `K-` prefix (`K-001`..`K-016`). Each task cites the exact spec requirement(s) it
> satisfies via `finance-calendar-projection/Requirement Name` or `finance-recurring/Requirement Name`.
> Design section references use `design.md §N`. Strict TDD is `false` for this project
> (critical-logic focus, not blanket TDD). RED-first ordering applies to the domain's genuinely
> critical-logic surfaces: `projectOccurrences()`'s expansion/overdue-fold/cap behavior and the
> unknown-frequency-skip regression (design.md §6 Decision 5 — prevents a server-render 500). The
> greenfield UI route gets RTL smoke coverage per the `finance-categories-icon-color` convention
> (`C-008`/`C-013` pattern) but is not RED-gated.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950 total (design.md §"PR Slicing") |
| 1000-line budget risk | High — no headroom against the 1000-line budget |
| Chained PRs recommended | Yes |
| Suggested split | PR A (domain + unit tests, ~370) → PR B (calendar UI, ~580) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
1000-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `domain/calendar.ts` exposes a proven, pure `projectOccurrences`/`projectBalance`/`buildMonthCells`; zero React in the diff | PR A | `pnpm vitest run tests/unit/finance-calendar-projection.test.ts tests/unit/finance-calendar-balance.test.ts` | N/A — pure functions, no runnable UI surface yet | Delete `src/modules/finance/domain/calendar.ts`, revert the `domain/index.ts` barrel line, delete the two test files |
| 2 | `/calendario` renders a read-only 90-day projection grid with an explicit outflows-only disclaimer, wired from PR A's API | PR B | `pnpm vitest run tests/unit/calendar-grid-render.test.tsx tests/unit/calendar-screen-render.test.tsx` | Manual: open `/calendario` at 375px light+dark against local Supabase | Delete `src/design-system/patterns/CalendarGrid.tsx`, delete `src/app/(app)/calendario/`, revert the `layout.tsx` nav item, delete the two RTL test files — PR A is unaffected |

---

## PR A — Domain Projection + Unit Tests (~370 lines)

### (a) Domain Module

- [x] K-001 — Verify `src/modules/finance/api/index.ts` re-exports the `domain` barrel (design.md
  Open Question #1). If it already does, no change; if not, add the one-line re-export so `app`
  never imports `domain` directly (ESLint boundary).
  - Depends on: none.
  - Parallel: yes, independent of everything else — do first, it gates whether later app-layer
    tasks need an extra line.

- [x] K-002 [RED] — `tests/unit/finance-calendar-projection.test.ts` (create): failing tests for
  `projectOccurrences(definitions, fromDate, horizonDays?)` covering: weekly/monthly/biweekly/yearly
  expansion over 90 days; monthly anchored `2026-01-31` clamps to `02-28` then drifts to `03-28`;
  due-today lands in day 0 with `overdue: false`; `active: false` never appears; empty input → `[]`;
  deterministic `(date, description, definitionId)` ordering. Fails: `domain/calendar.ts` does not
  exist yet.
  - Satisfies (drives): `finance-recurring/Bounded Multi-Occurrence Projection` (all 4 scenarios).
  - Depends on: none.
  - Parallel: yes, independent of K-003.

- [x] K-003 [RED] — Extend `tests/unit/finance-calendar-projection.test.ts` with the named
  regression + bounds cases: a definition 3 months overdue yields exactly ONE occurrence at
  `fromDate` with `overdue: true` and its original `scheduledDate`, next occurrence strictly after
  `fromDate`; a crafted non-advancing cursor terminates via the strict-monotonic guard rather than
  hanging; occurrence count per definition never exceeds `MAX_OCCURRENCES_PER_DEFINITION` (128);
  `horizonDays` clamps to `[0, MAX_HORIZON_DAYS]`; **an unrecognized `frequency` value skips the row
  instead of throwing** — named regression for the server-render 500 (design.md §6 Decision 5).
  - Satisfies (drives): `finance-recurring/Bounded Multi-Occurrence Projection` (paused-exclusion
    scenario), design.md §6 Decision 5 (unknown-frequency-skip regression), Threat Matrix
    "hostile stored values reaching the renderer".
  - Depends on: K-002 (same file).
  - Parallel: sequential after K-002.

- [x] K-004 [GREEN] — `src/modules/finance/domain/calendar.ts` (create): `PROJECTION_HORIZON_DAYS`,
  `MAX_OCCURRENCES_PER_DEFINITION`, `MAX_HORIZON_DAYS`, `ProjectableDefinition`,
  `ProjectedOccurrence` types, and `projectOccurrences()` implementing the expansion algorithm
  (design.md §2) — implemented to satisfy K-002/K-003. Imports only `nextDueDate`/
  `nextFutureDueDate` from `./recurring`; `recurring.ts` itself gets zero diff.
  - Depends on: K-003.
  - Parallel: sequential.

- [x] K-005 [RED] — `tests/unit/finance-calendar-balance.test.ts` (create): failing tests for
  `projectBalance(definitions, anchorCents, fromDate, horizonDays?)` covering: `days.length === 91`,
  contiguous with no gaps, `days[0].date === fromDate`; `closingBalanceCents === anchorCents -
  cumulativeOutflowCents` every day; `cumulativeOutflowCents` monotonically non-decreasing; zero
  definitions → flat line at the anchor, `firstNegativeDate: null`; an oversized charge set sets the
  correct first negative day; negative stored `amountCents` still reduces the balance
  (`Math.abs` normalization); `debtCents` is absent from `BalanceProjection` and cannot influence the
  result. Fails: `projectBalance` does not exist yet.
  - Satisfies (drives): `finance-calendar/Day-0 Anchor Is the Current Available Balance`,
    `finance-calendar/Item Due Today Reduces Day 0's Closing Balance`,
    `finance-calendar/Overdue Items Fold Into Day 0`,
    `finance-calendar/Empty State Shows a Flat Line, Not an Error`,
    `finance-calendar/First Negative Day Is Visually Surfaced`.
  - Depends on: K-004.
  - Parallel: yes, independent of K-006.

- [x] K-006 [RED] — Extend `tests/unit/finance-calendar-balance.test.ts` with `buildMonthCells`
  grid-mapping cases: leading offset for a month starting Sunday and one starting Saturday;
  28/29/30/31-day months incl. leap February; days outside the horizon flagged `inHorizon: false`;
  exactly one cell `isToday`.
  - Satisfies (drives): `finance-calendar/Projection Window Is 90 Days With a Hard Iteration Cap`
    (grid-boundary rendering), design.md §4 (`CalendarCell` mapping contract).
  - Depends on: K-005 (same file).
  - Parallel: sequential after K-005.

- [x] K-007 [GREEN] — `src/modules/finance/domain/calendar.ts` (modify): add `ProjectedDay`,
  `BalanceProjection` types, `projectBalance()` (running-balance fold, design.md §2 "Running
  balance") and `buildMonthCells(projection, month)` (pure `BalanceProjection` → `CalendarCell[]`
  adapter, design.md §4) — implemented to satisfy K-005/K-006.
  - Depends on: K-006.
  - Parallel: sequential (closes out the domain module).

- [x] K-008 — `src/modules/finance/domain/index.ts` (modify): add `export * from "./calendar";`.
  Assert `src/modules/finance/domain/recurring.ts` shows a zero diff (design.md §7).
  - Depends on: K-007.
  - Parallel: sequential (closes out PR A).

---

## PR B — Calendar UI (~580 lines, stacked on PR A)

### (b) Design-System Pattern

- [x] K-009 — `tests/unit/calendar-grid-render.test.tsx` (create): RTL smoke test —
  `CalendarGrid` renders 7 weekday header cells (Sunday-first, `D L M M J V S`) plus
  `offset + daysInMonth` day cells; a `hasCharges` cell shows its marker; an `isNegative` cell carries
  the `--expense` token; clicking a cell calls `onSelectDate`; cells are `button`s with a
  date-bearing `aria-label`; out-of-horizon cells are `disabled`.
  - Satisfies: `finance-calendar/First Negative Day Is Visually Surfaced` (UI rendering),
    `finance-calendar/Only Active Recurring Expense Definitions Are Projected` (marker rendering).
  - Depends on: K-007 (`CalendarCell` type contract, design.md §4).
  - Parallel: yes, independent of K-011/K-012.

- [x] K-010 — `src/design-system/patterns/CalendarGrid.tsx` (create): `CalendarGrid` +
  internal `CalendarDayCell`, primitive `CalendarCell` props only (no finance types, no cents),
  `grid grid-cols-7`, Sunday-first weekday header, leading blank cells for the 1st's offset,
  keyboard-operable `button` cells with `aria-pressed`/`aria-label` — implemented to satisfy K-009.
  - Depends on: K-009.
  - Parallel: sequential.

### (c) Route

- [x] K-011 — `tests/unit/calendar-screen-render.test.tsx` (create): RTL smoke test — the
  outflows-only disclaimer text is present (mitigation for the High-likelihood misreading risk); an
  all-zero projection renders a grid, not an error or blank; selecting a day updates
  `ProjectionDayPanel`; a folded-overdue row is visibly marked as overdue.
  - Satisfies: `finance-calendar/UI Labels the Projection as Outflows Only, Never a Full Forecast`
    (tested requirement, not a nicety), `finance-calendar/Empty State Shows a Flat Line, Not an
    Error`, `finance-calendar/Overdue Items Fold Into Day 0` (UI marking).
  - Depends on: K-010.
  - Parallel: yes, independent of K-012/K-013 (drives the screen below).

- [x] K-012 — `src/app/(app)/calendario/ProjectionDayPanel.tsx` (create): client, presentational —
  selected day's occurrences (description, `MoneyAmount kind="expense"`), the day's closing balance,
  an overdue marker for folded rows.
  - Depends on: K-010.
  - Parallel: yes, parallel with K-013.

- [x] K-013 — `src/app/(app)/calendario/CalendarScreen.tsx` (create): client — visible-month +
  selected-day `useState` only, month prev/next bounded to the horizon's months, header showing
  `Disponible hoy` and `Próximos 90 días`, explicit "recurring outflows only, does not include future
  income" disclaimer line, renders `<CalendarGrid>` + `<ProjectionDayPanel>` — implemented to satisfy
  K-011.
  - Depends on: K-011, K-012.
  - Parallel: sequential.

- [x] K-014 — `src/app/(app)/calendario/page.tsx` (create): server container — `getCurrentHouseholdId`
  → `Promise.all([getHouseholdSummary, listRecurringDefinitions])` (unchanged repository reads) →
  `fromDate = new Date().toISOString().slice(0, 10)` computed **server-side** (design.md §3, Decision
  6 — avoids a UTC-midnight hydration mismatch) → `projectBalance(...)` runs server-side → renders
  `<CalendarScreen>` with the serialized `BalanceProjection`. Mirrors `recurrentes/page.tsx`'s
  `spaceId ? Promise.all(...) : defaults` guard. No `actions.ts` — structural expression of the
  read-only boundary.
  - Satisfies: `finance-calendar/Day-0 Anchor Is the Current Available Balance`,
    `finance-calendar/Only Active Recurring Expense Definitions Are Projected`, design.md §3
    (data-flow wiring end-to-end).
  - Depends on: K-013.
  - Parallel: sequential.

- [x] K-015 — `src/app/(app)/layout.tsx` (modify): append one `OverflowMenu` item —
  `/calendario`, "Calendario", `CalendarDays` icon — matching the `/categorias` precedent.
  - Depends on: K-014.
  - Parallel: yes, can land alongside K-016.

- [x] K-016 — Verify against design.md Open Questions #2/#3: seven 44px touch targets fit
  `max-w-md` + `px-4` at 375px (else switch cells to a square aspect ratio, no horizontal scroll);
  month-nav bounds read naturally when the 90-day horizon ends mid-month. Confirm via real render,
  not inspection. Assert `supabase/migrations/`, `src/modules/finance/data/`, `package.json` show a
  zero diff (design.md §7 success criteria).
  - Depends on: K-015.
  - Parallel: sequential (closes out PR B).

---

## Dependency Summary (critical path)

```
K-001 (api/index.ts verify)                                                     [PR A, independent]
K-002 [RED] → K-003 [RED] → K-004 [GREEN] (projectOccurrences)
K-004 → K-005 [RED] → K-006 [RED] → K-007 [GREEN] (projectBalance, buildMonthCells)
K-007 → K-008 (domain barrel line)                                              [PR A closes]
K-008 → K-009 [RTL] → K-010 (CalendarGrid)                                      [PR B]
K-010 → K-011 [RTL], K-012 (ProjectionDayPanel, parallel with K-011)
K-011, K-012 → K-013 (CalendarScreen) → K-014 (page.tsx)
K-014 → K-015 (nav item) → K-016 (final render/diff verification)               [PR B closes]
```

K-002/K-003 and K-005/K-006 ARE explicit RED-first gates: they cover the design's named
critical-logic surfaces — expansion/overdue-fold, the iteration-cap termination proof, and the
unknown-frequency-skip regression (design.md §6 Decision 5) that prevents a bad DB row from 500-ing
`/calendario`'s server render. K-009/K-011 are RTL smoke tests, not RED gates, per this project's
non-blanket-TDD convention for greenfield UI (`finance-categories-icon-color/C-008`/`C-013`
precedent applied to logic surfaces only — the UI route itself follows the `finance-budgets`-style
non-gate convention).
