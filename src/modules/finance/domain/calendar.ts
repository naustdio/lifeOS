// Pure day-by-day balance projection for `finance-calendar-projection` (design.md §2). No
// Supabase import, no I/O — ISO `YYYY-MM-DD` strings in and out, mirroring `domain/budget.ts` and
// `domain/recurring.ts`'s own discipline. This is a NEW, SEPARATE module from `recurring.ts`
// (design.md §1): `recurring.ts`'s stated invariant is byte-parity with
// `finance.advance_due_date()` (the write-side cursor contract used by confirm/discard and
// pause/resume). A read-only, multi-definition, balance-aware projection has no SQL counterpart
// at all, so it lives here instead — `recurring.ts` itself gets a ZERO diff from this change.
// `nextDueDate`/`nextFutureDueDate` are imported and reused as-is, never inlined or duplicated.

import { type Frequency, nextDueDate, nextFutureDueDate } from "./recurring";

export const PROJECTION_HORIZON_DAYS = 90;
/** Per-definition ceiling, DISTINCT from `nextFutureDueDate()`'s 2000-iteration single-occurrence
 *  cap (design.md §6 Decision 2). 90 days of the densest frequency (weekly) is ~13 occurrences;
 *  128 is ~10x headroom and can only be reached by corrupt or crafted cursor data. */
export const MAX_OCCURRENCES_PER_DEFINITION = 128;
export const MAX_HORIZON_DAYS = 365;

const KNOWN_FREQUENCIES: readonly string[] = ["monthly", "weekly", "biweekly", "yearly"];

function isKnownFrequency(value: string): value is Frequency {
  return KNOWN_FREQUENCIES.includes(value);
}

/** Direction a projected occurrence moves the balance: `outflow` (expense, subtracts) or
 *  `inflow` (income, adds). The caller derives this from the recurring definition's `type`
 *  (`expense` -> `outflow`, `income` -> `inflow`) — `transfer`-type definitions are excluded
 *  before reaching this domain entirely (they move money between the household's own accounts,
 *  never changing net worth), same as before this field existed. */
export type ProjectionKind = "outflow" | "inflow";

/** Structural subset of `RecurringListItem` — the domain never imports a data type
 *  (design.md §2). */
export type ProjectableDefinition = {
  id: string;
  description: string;
  categoryId: string;
  accountId: string;
  amountCents: number;
  kind: ProjectionKind;
  frequency: Frequency;
  nextDueDate: string;
  active: boolean;
};

export type ProjectedOccurrence = {
  definitionId: string;
  description: string;
  categoryId: string;
  accountId: string;
  /** POSITIVE magnitude — `Math.abs` applied on ingest (design.md §6 Decision 9), so a sign flip
   *  in stored data cannot silently invert direction. Use `kind` to know whether this adds to or
   *  subtracts from the running balance. */
  amountCents: number;
  kind: ProjectionKind;
  /** The day cell this occurrence lands in. */
  date: string;
  /** The definition's own cursor; differs from `date` only when folded (overdue: true). */
  scheduledDate: string;
  overdue: boolean;
};

export type ProjectedDay = {
  date: string;
  occurrences: ProjectedOccurrence[];
  /** Signed net movement for this day only: positive = net inflow, negative = net outflow. */
  netCents: number;
  /** Signed cumulative net movement from `fromDate` through `date`, inclusive. */
  cumulativeNetCents: number;
  closingBalanceCents: number;
  isNegative: boolean;
};

export type BalanceProjection = {
  fromDate: string;
  toDate: string;
  anchorCents: number;
  /** EXACTLY `horizonDays + 1` entries, contiguous, `days[0].date === fromDate`. */
  days: ProjectedDay[];
  /** Signed net movement across the whole window: positive = net inflow, negative = net outflow. */
  totalNetCents: number;
  firstNegativeDate: string | null;
  overdueCount: number;
};

function clampHorizonDays(horizonDays: number | undefined): number {
  const requested = horizonDays ?? PROJECTION_HORIZON_DAYS;
  return Math.min(Math.max(requested, 0), MAX_HORIZON_DAYS);
}

function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function daysInMonthUTC(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of `month` (UTC, avoids local-TZ drift) — same trick
  // as the private helper in `recurring.ts`, duplicated here (one line) rather than exported from
  // a file whose invariant is unrelated to grid mapping.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Bounded multi-occurrence expansion (design.md §2, `finance-recurring/Bounded Multi-Occurrence
 * Projection`). Pure and side-effect-free: no `next_due_date` is ever read-modified-written here.
 * Per-definition expansion algorithm:
 *   - skip if `!active`; skip if `frequency` is not one of the 4 known values — the projection
 *     runs during SERVER RENDER, so `nextDueDate()`'s `default:` throw must never propagate
 *     (design.md §6 Decision 5).
 *   - if the cursor is strictly before `fromDate`, fold the entire backlog into exactly ONE
 *     occurrence at `fromDate` (design.md §6 Decision 3), then resume via `nextFutureDueDate`.
 *   - otherwise roll forward via `nextDueDate` until the cursor exceeds `toDate`, the
 *     per-definition cap is reached, or the cursor fails to strictly advance (the real
 *     termination proof, design.md §6 Decision 2).
 */
export function projectOccurrences(
  definitions: readonly ProjectableDefinition[],
  fromDate: string,
  horizonDays?: number,
): ProjectedOccurrence[] {
  const horizon = clampHorizonDays(horizonDays);
  const toDate = addDaysISO(fromDate, horizon);
  const occurrences: ProjectedOccurrence[] = [];

  for (const def of definitions) {
    if (!def.active) continue;
    if (!isKnownFrequency(def.frequency)) continue;

    const amount = Math.abs(def.amountCents);
    let cursor = def.nextDueDate;
    let emitted = 0;

    if (cursor < fromDate) {
      occurrences.push({
        definitionId: def.id,
        description: def.description,
        categoryId: def.categoryId,
        accountId: def.accountId,
        amountCents: amount,
        kind: def.kind,
        date: fromDate,
        scheduledDate: cursor,
        overdue: true,
      });
      emitted += 1;
      cursor = nextFutureDueDate(cursor, def.frequency, fromDate);
    }

    while (cursor <= toDate && emitted < MAX_OCCURRENCES_PER_DEFINITION) {
      occurrences.push({
        definitionId: def.id,
        description: def.description,
        categoryId: def.categoryId,
        accountId: def.accountId,
        amountCents: amount,
        kind: def.kind,
        date: cursor,
        scheduledDate: cursor,
        overdue: false,
      });
      emitted += 1;

      const next = nextDueDate(cursor, def.frequency);
      if (next <= cursor) break; // strict-monotonic guard — termination proof
      cursor = next;
    }
  }

  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.description !== b.description) return a.description < b.description ? -1 : 1;
    if (a.definitionId !== b.definitionId) return a.definitionId < b.definitionId ? -1 : 1;
    return 0;
  });

  return occurrences;
}

/**
 * Running-balance fold over `projectOccurrences()` (design.md §2 "Running balance"). `anchorCents`
 * is `getHouseholdSummary().availableCents` — asset accounts only; `debtCents` is never subtracted
 * (design.md §6 Decision 10) and has no field on this type. Day 0 carries both folded-overdue and
 * due-today charges, so `days[0].closingBalanceCents` is generally NOT the anchor — the intended
 * "never optimistic" behavior. Zero definitions produces a flat line at the anchor, a valid
 * projection, not an empty state.
 */
export function projectBalance(
  definitions: readonly ProjectableDefinition[],
  anchorCents: number,
  fromDate: string,
  horizonDays?: number,
): BalanceProjection {
  const horizon = clampHorizonDays(horizonDays);
  const toDate = addDaysISO(fromDate, horizon);
  const occurrences = projectOccurrences(definitions, fromDate, horizon);

  const byDate = new Map<string, ProjectedOccurrence[]>();
  for (const occurrence of occurrences) {
    const bucket = byDate.get(occurrence.date);
    if (bucket) bucket.push(occurrence);
    else byDate.set(occurrence.date, [occurrence]);
  }

  const days: ProjectedDay[] = [];
  let running = 0;
  let firstNegativeDate: string | null = null;
  let overdueCount = 0;

  for (let i = 0; i <= horizon; i += 1) {
    const date = addDaysISO(fromDate, i);
    const dayOccurrences = byDate.get(date) ?? [];
    const netCents = dayOccurrences.reduce(
      (sum, o) => sum + (o.kind === "inflow" ? o.amountCents : -o.amountCents),
      0,
    );
    running += netCents;
    const closingBalanceCents = anchorCents + running;
    const isNegative = closingBalanceCents < 0;
    if (isNegative && firstNegativeDate === null) firstNegativeDate = date;
    overdueCount += dayOccurrences.filter((o) => o.overdue).length;

    days.push({
      date,
      occurrences: dayOccurrences,
      netCents,
      cumulativeNetCents: running,
      closingBalanceCents,
      isNegative,
    });
  }

  return {
    fromDate,
    toDate,
    anchorCents,
    days,
    totalNetCents: running,
    firstNegativeDate,
    overdueCount,
  };
}

/** Primitive cell shape the calendar grid renders (design.md §4) — deliberately structurally
 *  identical to, but independent of, `design-system/patterns/CalendarGrid.tsx`'s own
 *  `CalendarCell` export, so the design-system layer stays finance-free while still typing this
 *  adapter's return value here, next to the projection it reads. */
export type CalendarCell = {
  date: string;
  day: number;
  inHorizon: boolean;
  hasCharges: boolean;
  isNegative: boolean;
  isToday: boolean;
};

/**
 * Pure adapter from `BalanceProjection` to a single month's `CalendarCell[]` (design.md §4) —
 * exactly the days of `month`, ascending. The leading-blank offset for the 1st's weekday is a UI
 * concern computed by the design-system pattern from `cells[0]`'s own date, not returned here.
 */
export function buildMonthCells(projection: BalanceProjection, month: string): CalendarCell[] {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const totalDays = daysInMonthUTC(year, monthNum);

  const dayByDate = new Map(projection.days.map((d) => [d.date, d] as const));
  const cells: CalendarCell[] = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
    const inHorizon = date >= projection.fromDate && date <= projection.toDate;
    const projectedDay = inHorizon ? dayByDate.get(date) : undefined;

    cells.push({
      date,
      day,
      inHorizon,
      hasCharges: (projectedDay?.occurrences.length ?? 0) > 0,
      isNegative: projectedDay?.isNegative ?? false,
      isToday: date === projection.fromDate,
    });
  }

  return cells;
}
