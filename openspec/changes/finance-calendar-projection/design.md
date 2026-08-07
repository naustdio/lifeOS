# Design: Finance Calendar — Day-by-Day Balance Projection

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in
> `finance-categories-icon-color/design.md` and `archive/finance-budgets/design.md`, the
> orchestrator's task contract for this change explicitly requires a domain-function contract, the
> running-balance algorithm, a greenfield UI shape, an architectural-deviation record, and a PR
> slicing assessment. The explicit contract wins.
>
> **Inputs**: `proposal.md` (owner-confirmed: expense-outflows-only v1, recurring-only, 100%
> client-computed, overdue folds into day 0, 90-day horizon with an explicit cap). Those five are
> fixed constraints and are **not** re-litigated here. `specs/` is authored in parallel by
> `sdd-spec`; this design is derived from `proposal.md` directly. Conventions inherited verbatim
> from `archive/lifeos-foundation/design.md` §3/§4/§7/§9 and the shipped `finance-recurring` code.

## Technical Approach

The whole feature is **one pure reduction over data that already exists**. Two repository reads
that ship today and change zero lines — `getHouseholdSummary()` (day-0 anchor) and
`listRecurringDefinitions()` (the schedule) — feed a new pure domain module that expands each
active definition into occurrences across a bounded window and folds them into a **dense,
contiguous day array** carrying a running closing balance. The UI renders that array; it never
computes money.

Two hard boundaries hold this shape in place: **no migration** (`supabase/migrations/` and
`src/modules/finance/api/` show a zero diff) and **no new npm package** (`package.json` unchanged).
The only genuinely new engineering is the calendar grid, which is greenfield.

## 1. Where the Projection Lives — `src/modules/finance/domain/calendar.ts` (Create)

The proposal sketched `projectOccurrences()` inside `domain/recurring.ts`. **Design decision: put it
in a new `domain/calendar.ts` instead**, importing `nextDueDate` / `nextFutureDueDate` from
`recurring.ts`.

`recurring.ts` has a single, narrowly stated invariant in its own header: every function there
"MUST stay behaviorally identical to `finance.advance_due_date()` — the SQL seam and this function
compute the same cursor." It is the **write-side** cursor contract, exercised by confirm/discard and
pause/resume. A read-only, multi-definition, balance-aware projection has **no SQL counterpart at
all** and never will while this feature stays client-computed. Mixing it into that file dilutes an
invariant that is currently crisp and load-bearing, and it would put a 90-day horizon constant next
to a function whose parity partner is a Postgres routine.

The proposal's *capability* requirement — "the domain layer MUST expose a bounded multi-occurrence
projection" — is satisfied either way: `domain/index.ts` gains one line (`export * from
"./calendar";`) and the public domain surface is byte-identical to the in-`recurring.ts` variant.
`recurring.ts` itself is **unmodified** by this change, which also shrinks the blast radius on the
recurring write path to zero.

## 2. Domain Contract

```ts
// src/modules/finance/domain/calendar.ts
import { type Frequency, nextDueDate, nextFutureDueDate } from "./recurring";

export const PROJECTION_HORIZON_DAYS = 90;
/** Per-definition ceiling, DISTINCT from nextFutureDueDate()'s 2000-iteration single-occurrence
 *  cap. 90 days of the densest frequency (weekly) is ~13 occurrences; 128 is ~10x headroom and
 *  can only be reached by corrupt data. */
export const MAX_OCCURRENCES_PER_DEFINITION = 128;
export const MAX_HORIZON_DAYS = 365;

/** Structural subset of RecurringListItem — the domain never imports a data type. */
export type ProjectableDefinition = {
  id: string; description: string; categoryId: string; accountId: string;
  amountCents: number; frequency: Frequency; nextDueDate: string; active: boolean;
};

export type ProjectedOccurrence = {
  definitionId: string; description: string; categoryId: string; accountId: string;
  amountCents: number;    // POSITIVE magnitude of the outflow (Math.abs applied)
  date: string;           // the day cell it lands in
  scheduledDate: string;  // the definition's own cursor; differs from `date` only when folded
  overdue: boolean;
};

export type ProjectedDay = {
  date: string;
  occurrences: ProjectedOccurrence[];
  outflowCents: number;             // that day only
  cumulativeOutflowCents: number;   // fromDate..date inclusive
  closingBalanceCents: number;      // anchorCents - cumulativeOutflowCents
  isNegative: boolean;              // closingBalanceCents < 0
};

export type BalanceProjection = {
  fromDate: string; toDate: string;
  anchorCents: number;
  days: ProjectedDay[];             // EXACTLY horizonDays + 1 entries, contiguous, days[0].date === fromDate
  totalOutflowCents: number;
  firstNegativeDate: string | null;
  overdueCount: number;
};

export function projectOccurrences(
  definitions: readonly ProjectableDefinition[], fromDate: string,
  horizonDays?: number,
): ProjectedOccurrence[];

export function projectBalance(
  definitions: readonly ProjectableDefinition[], anchorCents: number, fromDate: string,
  horizonDays?: number,
): BalanceProjection;
```

Two functions, not one: `projectOccurrences` is the date-arithmetic unit under test; `projectBalance`
is the arithmetic fold. Splitting them keeps each test file about one failure mode, and the calendar
grid only ever consumes `BalanceProjection`.

### Per-definition expansion algorithm

```
skip if !active                                   → paused never appears in any cell
skip if frequency not in {monthly,weekly,biweekly,yearly}  → see Decision 5
amount = Math.abs(def.amountCents)
cursor = def.nextDueDate

if cursor < fromDate:                             → OVERDUE: emit ONE occurrence at fromDate
    emit { date: fromDate, scheduledDate: cursor, overdue: true }
    cursor = nextFutureDueDate(cursor, freq, fromDate)   // reuse; drops the backlog
                                                  // (cursor is now STRICTLY after fromDate)
while cursor <= toDate and emitted < MAX_OCCURRENCES_PER_DEFINITION:
    emit { date: cursor, scheduledDate: cursor, overdue: false }   // cursor == fromDate ⇒ "due today"
    next = nextDueDate(cursor, freq)
    if next <= cursor: break                      // strict-monotonic guard: termination proof
    cursor = next
```

**Exactly one folded occurrence, never a backlog.** A definition three months overdue contributes
one charge, not three. This is not a shortcut: `finance.recurring_due` surfaces one row per
definition, and `nextFutureDueDate()` exists precisely so a long-paused definition "surfaces no
backlog". Emitting a synthetic backlog here would make the calendar disagree with `/recurrentes`
about how much money is owed.

Output is sorted `(date asc, description asc, definitionId asc)` so rendering and snapshots are
deterministic regardless of repository row order.

**Termination is proved twice**: by the `cursor <= toDate` bound plus the strict-monotonic guard
(the loop cannot advance without the date strictly increasing), and independently by
`MAX_OCCURRENCES_PER_DEFINITION`. Either alone is sufficient; the pair means neither a future
frequency with a zero-length period nor a corrupt cursor can hang a server render.

### Running balance

```
horizon  = clamp(horizonDays ?? 90, 0, MAX_HORIZON_DAYS)
days[i]  = fromDate + i, for i in 0..horizon        ← dense, contiguous, no gaps
bucket   = groupBy(projectOccurrences(...), o => o.date)
running  = 0
for each day:
  day.outflowCents           = sum(bucket[day.date])
  running += day.outflowCents
  day.cumulativeOutflowCents = running
  day.closingBalanceCents    = anchorCents - running
  day.isNegative             = day.closingBalanceCents < 0
firstNegativeDate = first day with isNegative, else null
```

`anchorCents` is `getHouseholdSummary().availableCents` — asset accounts only. `debtCents` is
**never** subtracted, per `archive/lifeos-foundation/design.md` §3.3 and the repository's own
comment; doing so here would silently redefine the hero figure the rest of the app shows.

Day 0 therefore carries folded-overdue **and** due-today charges, and `days[0].closingBalanceCents`
is generally **not** the anchor. That is the intended "never optimistic" behavior and must be labeled
in the UI (§4). A household with zero active definitions produces 91 days of `outflowCents: 0` and a
flat `closingBalanceCents === anchorCents` — a valid projection, not an empty state.

## 3. Data Flow

```
/calendario/page.tsx (server component)
   getCurrentHouseholdId(supabase)
        ├─▶ getHouseholdSummary(supabase, spaceId)      → availableCents   (unchanged fn)
        └─▶ listRecurringDefinitions(supabase, spaceId) → definitions      (unchanged fn)
                          │
        fromDate = new Date().toISOString().slice(0, 10)      ← SERVER-side "today", UTC
                          │
        projectBalance(definitions, availableCents, fromDate, 90)   ← pure, runs on the server
                          │
                          ▼ serialized BalanceProjection (91 days)
        CalendarScreen (client)  ── owns ONLY: visible month + selected day (useState)
             ├─▶ <CalendarGrid />        design-system pattern, primitive cell props
             └─▶ <ProjectionDayPanel />  route-local: selected day's occurrences + closing balance
```

**`fromDate` is computed on the server, not in the client.** Every existing screen
(`RecurringList.tsx:44`, `TransactionForm.tsx:27`, `recurrentes/actions.ts:29`) uses
`new Date().toISOString().slice(0, 10)` locally, which is fine for a form default but would be a
**hydration hazard** here: the whole grid — which cell is "today", which cells carry charges, every
balance — is derived from that string, so a client recomputation across a UTC midnight boundary
renders different HTML than the server did. Computing once on the server and passing a plain
serializable object removes the class of bug entirely and ships zero projection JS to the browser.

## 4. UI — `/calendario` (greenfield)

### Decision: hand-built CSS-grid calendar, no date library

`package.json` has no date library and none of the 13 `design-system/patterns` is a calendar. The
month grid needs exactly two date facts — **the weekday of the 1st** and **the number of days in the
month** — both one `Date.UTC(...)` expression each, and the second already exists as a private
`daysInMonth` helper in `recurring.ts`. `date-fns` or `dayjs` would add a dependency to avoid ~8
lines of arithmetic this codebase has already shipped and unit-tested; `react-day-picker` solves
*date selection*, not *balance-per-day rendering*, so the cells would still be hand-authored and we
would inherit its styling surface for nothing. The precedent is explicit: `OverflowMenu` hand-rolls
its disclosure rather than adding a package, and the proposal lists "any new npm dependency" as out
of scope. **No dependency.**

### `src/design-system/patterns/CalendarGrid.tsx` (Create)

One file exporting `CalendarGrid` plus an internal `CalendarDayCell` — the cell has no standalone
call site, and two files would only add a barrel hop. The pattern takes **primitive props only** (no
finance types, no cents), keeping the design-system layer domain-free and `check-tokens.mjs` clean:

```ts
export type CalendarCell = {
  date: string; day: number;
  inHorizon: boolean; hasCharges: boolean; isNegative: boolean; isToday: boolean;
};
export interface CalendarGridProps {
  month: string;                    // "YYYY-MM"
  cells: CalendarCell[];            // exactly the days of `month`, ascending
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}
```

`buildMonthCells(projection, month)` — the pure adapter from `BalanceProjection` to
`CalendarCell[]` — lives in `domain/calendar.ts` next to the projection, so the mapping is unit-
testable without React.

Layout: `grid grid-cols-7`, a weekday header row **starting Sunday** (`D L M M J V S`), leading
blank cells for the offset of the 1st. Sunday-first matches the `es-MX` locale's own `firstDay`
and Mexican printed calendars; it is a named constant, not an inline assumption. Cells are `button`
elements (`aria-pressed`, `aria-label` carrying the full date and the day's closing balance) so the
grid is keyboard-operable without a roving-tabindex implementation. Out-of-horizon days render
muted and `disabled`. `hasCharges` shows a dot; `isNegative` uses the existing `--expense` token,
and `projection.firstNegativeDate` gets the strongest treatment — it is the one number the whole
screen exists to surface.

### `src/app/(app)/calendario/` (Create)

| File | Role |
|---|---|
| `page.tsx` | Server container: two reads, `fromDate`, `projectBalance`, render `CalendarScreen`. Mirrors `recurrentes/page.tsx` verbatim, including the `spaceId ? Promise.all(...) : defaults` guard. |
| `CalendarScreen.tsx` | Client: visible-month + selected-day state, month prev/next **bounded to the horizon's months**, header summary, disclaimer. |
| `ProjectionDayPanel.tsx` | Client, presentational: selected day's occurrences (description, `CategoryChip`-free, `MoneyAmount kind="expense"`), the day's closing balance, and an overdue marker for folded rows. |

There is **no `actions.ts`** — this route has no write path, which is the structural expression of
the read-only boundary in the proposal's risk table.

Header copy is load-bearing against the "users read this as a real forecast" risk (rated High):
the screen shows the anchor (`Disponible hoy`), the window (`Próximos 90 días`), and an explicit
line stating this projects **recurring outflows only and does not include future income**. The
descending curve is honest only with that label attached.

Single column, `max-w-md` shell, usable at 375px: 7 columns of ~44px fit inside the existing
`px-4` container, and the day detail sits **below** the grid rather than beside it — never a
side-by-side desktop table.

Nav: one entry appended to the existing `OverflowMenu` items array in `src/app/(app)/layout.tsx`
(`/calendario`, "Calendario", `CalendarDays` icon), matching how `/categorias` was added.

## 5. Architectural Deviation — Client Compute vs. a Postgres View (required record)

**Every other derived number in this codebase is a `security_invoker = true` Postgres view**:
`account_balances`, `household_summary`, `month_summary`, `category_spend`, `recurring_due`. This
projection deliberately breaks that pattern and computes in TypeScript. Recorded here so a future
reviewer reads it as a decision, not an oversight:

| | View / RPC | Client compute (**chosen**) |
|---|---|---|
| Cost | New migration + `generate_series` + recursive date rolling to replicate `advance_due_date()` per definition across 90 days | Reuses `nextDueDate()`, already pure, UTC-safe and unit-tested |
| Consistency risk | A **second** implementation of period arithmetic that must stay identical to `advance_due_date()` forever | One implementation, called from TS |
| Rollback | A migration to reverse | Delete files |
| Tenancy | RLS via `security_invoker` | RLS already enforced on the two underlying reads; the projection sees only rows the user could already fetch |
| Scale | Set-based | O(definitions x occurrences); tens of definitions per household, bounded at 128 occurrences each — trivial |

**Escalation trigger, stated in advance**: move to a view or RPC if (a) manual future-dated
transactions must be merged server-side, (b) a household's definition count makes the server render
measurably slower, or (c) another surface (export, notification, a second client) needs the same
number. Until one of those is true, a migration buys nothing and costs a duplicated date algorithm.

## 6. Key Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | New `domain/calendar.ts`, `recurring.ts` untouched | `projectOccurrences()` inside `recurring.ts` (as the proposal sketched) | `recurring.ts`'s stated invariant is byte-parity with `finance.advance_due_date()`; a read-only projection has no SQL counterpart. The `domain/index.ts` barrel makes the public surface identical, and the recurring write path gets a zero diff |
| 2 | Per-definition cap `128` + strict-monotonic guard | Reuse `nextFutureDueDate()`'s 2000 | 2000 is sized for a *single* occurrence over a decade; a 90-day multi-occurrence loop that reaches even 128 is already corrupt data. The monotonic guard, not the number, is the real termination proof |
| 3 | Overdue folds as **exactly one** occurrence on day 0 | Emit every missed period; drop overdue entirely | `recurring_due` shows one row per definition and `nextFutureDueDate()` deliberately drops backlog. A synthetic backlog would make `/calendario` and `/recurrentes` disagree about money owed; dropping it would make the projection optimistic |
| 4 | Dense 91-entry day array (`horizon + 1`) | Sparse map keyed by charge dates | The grid, the running balance, and `firstNegativeDate` all need *every* day. A sparse map pushes gap-filling into the React layer, where it is untestable and would silently break the balance carry |
| 5 | Unknown `frequency` → **skip the definition**, never throw | Let `nextDueDate()`'s `default:` throw propagate | `nextDueDate()` throws on an unrecognized frequency. The projection runs during **server render**, so one bad or newly-added enum value would 500 the whole page instead of degrading one row — the same degrade-not-throw contract the repositories already follow |
| 6 | `fromDate` computed server-side, projection serialized to the client | Client-side `new Date()` like the existing forms | Every cell's identity and balance derives from that string; recomputing in the browser is a hydration mismatch across a UTC midnight, and it would ship the projection code to the client for no benefit |
| 7 | Hand-built CSS grid, zero new dependencies | `date-fns` / `dayjs` / `react-day-picker` | Two date facts are needed and both are one-line UTC expressions already proven here; a picker library solves selection, not balance-per-day rendering, so cells stay hand-authored regardless. Precedent: `OverflowMenu` |
| 8 | `CalendarGrid` takes primitive cell props; `buildMonthCells` lives in the domain | Pass `BalanceProjection` into the pattern | Keeps `design-system/` free of finance types and keeps the month/offset mapping unit-testable without React |
| 9 | `Math.abs(amountCents)` on ingest | Trust the stored sign | Definitions store a positive magnitude and the confirm RPC applies `-abs()`; normalizing at the boundary means a sign flip in stored data cannot invert the curve into a fake income |
| 10 | `debtCents` never enters the anchor | Anchor at `available - debt` | `archive/lifeos-foundation/design.md` §3.3 — the hero figure is asset-only everywhere else; a different anchor here would read as a bug in one of the two screens |

## 7. File Changes

| File | Action | Description |
|---|---|---|
| `src/modules/finance/domain/calendar.ts` | Create | §2: `projectOccurrences`, `projectBalance`, `buildMonthCells`, caps and types |
| `src/modules/finance/domain/index.ts` | Modify | One line: `export * from "./calendar";` |
| `src/modules/finance/domain/recurring.ts` | **Unchanged** | Imported only; the write-side cursor contract is untouched |
| `src/modules/finance/data/*` | **Unchanged** | `getHouseholdSummary` / `listRecurringDefinitions` consumed as-is |
| `src/modules/finance/api/index.ts` | **Unchanged** | Domain is already re-exported through the existing barrel; verify at implementation and add one line only if it is not |
| `src/design-system/patterns/CalendarGrid.tsx` | Create | 7-col grid + internal day cell, primitive props, token-only styling |
| `src/app/(app)/calendario/page.tsx` | Create | Server container: two reads, `fromDate`, `projectBalance` |
| `src/app/(app)/calendario/CalendarScreen.tsx` | Create | Client: month/day state, bounded month nav, header + outflows-only disclaimer |
| `src/app/(app)/calendario/ProjectionDayPanel.tsx` | Create | Client: selected day's occurrences + closing balance |
| `src/app/(app)/layout.tsx` | Modify | One `OverflowMenu` item: `/calendario` |
| `tests/unit/finance-calendar-projection.test.ts` | Create | `projectOccurrences` — expansion, folding, caps, clamping |
| `tests/unit/finance-calendar-balance.test.ts` | Create | `projectBalance` + `buildMonthCells` — carry, negatives, density, grid offsets |
| `tests/unit/calendar-grid-render.test.tsx` | Create | RTL: grid shape, markers, selection, a11y |
| `tests/unit/calendar-screen-render.test.tsx` | Create | RTL: disclaimer, empty projection, day panel wiring |
| `supabase/migrations/` | **Unchanged** | Zero migrations — asserted as a success criterion |
| `package.json` | **Unchanged** | Zero new dependencies — asserted as a success criterion |

## 8. Testing Strategy

| Layer | What is tested | Tooling |
|---|---|---|
| Unit — expansion | Weekly over 90 days yields ~13 occurrences; monthly ~3; yearly 0 or 1; biweekly at the fixed 15-day interval. Monthly anchored 2026-01-31 clamps to 02-28 then **drifts** to 03-28 (asserting the inherited, intentional behavior, not fighting it). A definition due exactly `fromDate` lands in day 0 with `overdue: false`. A definition 3 months overdue yields **exactly one** occurrence at `fromDate` with `overdue: true` and its original `scheduledDate`, and its next occurrence is strictly after `fromDate`. `active: false` never appears. Empty input → `[]`. Output ordering is deterministic | Vitest |
| Unit — bounds | A crafted definition whose cursor cannot advance terminates via the monotonic guard rather than hanging; occurrence count per definition never exceeds `MAX_OCCURRENCES_PER_DEFINITION`; `horizonDays` is clamped to `[0, MAX_HORIZON_DAYS]`; an unrecognized `frequency` skips the row instead of throwing (Decision 5 — this is the named regression test for the server-render 500) | Vitest |
| Unit — balance | `days.length === 91`, contiguous with no gaps, `days[0].date === fromDate`; `closingBalanceCents === anchorCents - cumulativeOutflowCents` on every day; `cumulativeOutflowCents` is monotonically non-decreasing; zero definitions → flat line at the anchor with `firstNegativeDate: null`; a charge larger than the anchor sets `firstNegativeDate` to the correct first day and not a later one; negative stored `amountCents` still reduces the balance (Decision 9); `debtCents` is absent from the type and cannot influence the result | Vitest |
| Unit — grid mapping | `buildMonthCells` leading offset for a month starting Sunday and one starting Saturday; 28/29/30/31-day months incl. a leap February; days outside the horizon flagged `inHorizon: false`; `isToday` on exactly one cell | Vitest |
| RTL — pattern | `CalendarGrid` renders 7 header cells and `offset + daysInMonth` cells; a charge day shows its marker; the negative day carries the expense token; clicking a cell calls `onSelectDate`; cells are buttons with a date-bearing `aria-label`; out-of-horizon cells are `disabled` | Vitest + Testing Library |
| RTL — screen | The outflows-only disclaimer text is present (the mitigation for the High-likelihood misreading risk); an all-zero projection renders a grid, not an error or blank; selecting a day updates the panel; a folded-overdue row is visibly marked as overdue | Vitest + Testing Library |
| DB | **None.** Zero migrations, zero RLS objects, zero new views — there is nothing for pgTAP to assert that the existing `recurring`/`summary` suites do not already cover | — |
| Static gates | `pnpm verify`: ESLint boundaries (`domain` stays pure — `calendar.ts` imports only `./recurring`; `app → module-api/design-system/shared`), `tsc --noEmit`, `check-tokens.mjs`, `next build`. Plus a diff assertion that `supabase/migrations/`, `src/modules/finance/data/`, and `package.json` are unchanged | `pnpm verify` |
| E2E | Not required. Optional: `/calendario` at 375px in light and dark | Playwright (optional) |

## Threat Matrix

**N/A** — no shell command, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary is introduced, and the new Next.js route is a page addition, not a
command-dispatch surface (same disposition as `finance-categories-icon-color/design.md`). The real
adversarial surface is application-level and is covered explicitly:

- **Tenancy** — the projection consumes only rows the two existing RLS-guarded reads already return;
  it introduces no new query, no `SECURITY DEFINER`, and no `service_role` path.
- **Write surface** — there is none. No `actions.ts`, no `.rpc()`, no mutation. Rollback cannot
  corrupt data because the feature never writes.
- **Hostile stored values reaching the renderer** — an unrecognized `frequency` skips the row
  (Decision 5, tested) instead of throwing inside a server render; a wrong-signed `amountCents` is
  normalized with `Math.abs` (Decision 9, tested); a far-past cursor is bounded by the fold plus the
  per-definition cap (Decision 2/3, tested). No user-controlled string reaches a dynamic import or a
  component lookup.

## Migration / Rollout

**No migration required.** Purely additive and read-only; the app and the database are independently
deployable in either order because no column, view, policy, or function is touched.

Rollback = delete `src/modules/finance/domain/calendar.ts`, delete
`src/design-system/patterns/CalendarGrid.tsx`, delete `src/app/(app)/calendario/`, remove the two
added lines (`domain/index.ts` barrel, `layout.tsx` nav item), delete the four test files. No row is
mutated, no signature changes, and `finance/api`, `finance/data` and `supabase/` all revert to a
zero diff.

### PR Slicing — 1000-line review budget

Estimated ~950 authored lines, which sits against the 1000-line budget with no headroom. The
greenfield UI is the dominant driver (~600), exactly as the proposal's risk table anticipated. Two
stacked slices, mirroring the `finance-categories-icon-color` / `finance-budgets` convention
(PR #1 → feature branch, PR #2 → PR #1):

| Slice | Contents | Est. lines | Standalone value |
|---|---|---|---|
| **A — domain projection + tests** | `domain/calendar.ts`, `domain/index.ts` barrel line, `finance-calendar-projection.test.ts`, `finance-calendar-balance.test.ts` | ~370 | A bounded, proven projection exists in the domain layer and is exercised by tests; reviewable as pure date/money arithmetic with no React in the diff |
| **B — calendar UI** | `patterns/CalendarGrid.tsx`, `calendario/` route (3 files), `layout.tsx` nav entry, `calendar-grid-render.test.tsx`, `calendar-screen-render.test.tsx` | ~580 | The screen, on top of math that already exists and passes |

The split is clean because slice B imports slice A's public API and nothing flows the other way —
A has no React dependency and B has no date arithmetic. If B overruns during implementation, split
the `CalendarGrid` pattern + its RTL test (B1) from the route + screen tests (B2); they have no
compile-time dependency beyond the prop type.

Guard signals for `sdd-tasks`:

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High
```

## Open Questions

None blocking. Three implementation-time verifications (not assumptions to design around):

- [ ] Confirm `src/modules/finance/api/index.ts` already re-exports the `domain` barrel; if it does
      not, slice A adds one re-export line and the "zero `api/` diff" success criterion in the
      proposal becomes "one re-export line" — flag it rather than routing `app → domain` directly,
      which the ESLint boundary forbids.
- [ ] Confirm seven 44px touch targets plus gaps fit the `max-w-md` + `px-4` shell at 375px; if not,
      reduce the cell to a square aspect ratio rather than introducing horizontal scroll.
- [ ] Confirm the month-navigation bounds read naturally when the 90-day horizon ends mid-month
      (the last month is partially out of horizon by construction) — verify with a real render, not
      by inspection.
