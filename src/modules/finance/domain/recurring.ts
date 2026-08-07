// Pure date arithmetic for recurring expense definitions (design.md §6). No Supabase import, no
// I/O, ISO `YYYY-MM-DD` strings in and out — mirrors `domain/budget.ts` exactly. All three
// functions use UTC date construction (`Date.UTC` / `toISOString().slice(0,10)`) so the result
// never depends on the runtime's timezone, matching the `date`-typed SQL columns' own discipline.

export type Frequency = "monthly" | "weekly" | "biweekly" | "yearly";

/** Mirrors `finance.recurring_transactions.type`. `expense`/`income` each post one row against a
 *  category (opposite sign); `transfer` posts a balanced pair against a destination account. */
export type RecurringType = "expense" | "income" | "transfer";

export type RecurringShapeInput = {
  type: RecurringType;
  categoryId: string | null;
  toAccountId: string | null;
  /** Optional: when provided together with a transfer-type toAccountId, also rejects a
   *  self-transfer (toAccountId === accountId), mirroring recurring_transfer_shape's third
   *  clause. Omit when the source account is not yet known (e.g. a fresh, unattached form). */
  accountId?: string | null;
};

/**
 * Client-side mirror of the two DB CHECK constraints added by
 * `20260804090021_finance_recurring_transfer_shape.sql` — `recurring_expense_shape` and
 * `recurring_transfer_shape`. A defensive UX guard, NOT a second source of truth: the DB remains
 * authoritative and re-validates independently of whatever this function returns.
 *   expense/income: categoryId required, toAccountId must be null.
 *   transfer:       categoryId must be null, toAccountId required and distinct from accountId
 *                   (when accountId is supplied).
 */
export function validateRecurringShape(input: RecurringShapeInput): boolean {
  if (input.type === "expense" || input.type === "income") {
    return input.categoryId !== null && input.toAccountId === null;
  }
  // type === "transfer"
  if (input.categoryId !== null || input.toAccountId === null) {
    return false;
  }
  if (input.accountId != null && input.toAccountId === input.accountId) {
    return false;
  }
  return true;
}

type YMD = { year: number; month: number; day: number }; // month is 1-12

function parseISO(iso: string): YMD {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function formatISO({ year, month, day }: YMD): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of `month` (UTC, avoids local-TZ drift).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(iso: string, days: number): string {
  const { year, month, day } = parseISO(iso);
  const ms = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Advances an ISO date by exactly one period. MUST stay behaviorally identical to
 * finance.advance_due_date() — the SQL seam and this function compute the same cursor.
 *   monthly  — same day next month, CLAMPED to the last day of a shorter month
 *              (2026-01-31 → 2026-02-28; 2028-01-31 → 2028-02-29 in a leap year)
 *   weekly   — +7 days
 *   biweekly — +15 days EXACTLY (a fixed 15-day interval, not "every 2 weeks")
 *   yearly   — same month/day next year, 2028-02-29 → 2029-02-28 on a non-leap year
 * Clamping is one-way and non-restoring: 01-31 → 02-28 → 03-28. That anchor-day DRIFT is
 * accepted (design.md §10 Decision 5) precisely because Postgres drifts identically.
 */
export function nextDueDate(current: string, frequency: Frequency): string {
  const { year, month, day } = parseISO(current);

  switch (frequency) {
    case "weekly":
      return addDays(current, 7);
    case "biweekly":
      return addDays(current, 15);
    case "monthly": {
      const targetMonth = month === 12 ? 1 : month + 1;
      const targetYear = month === 12 ? year + 1 : year;
      return formatISO({ year: targetYear, month: targetMonth, day: Math.min(day, daysInMonth(targetYear, targetMonth)) });
    }
    case "yearly": {
      const targetYear = year + 1;
      return formatISO({ year: targetYear, month, day: Math.min(day, daysInMonth(targetYear, month)) });
    }
    default: {
      const exhaustive: never = frequency;
      throw new Error(`unknown frequency: ${exhaustive}`);
    }
  }
}

/** Whole days the cursor is past `today`. 0 on the due date, negative is impossible by caller
 *  contract but returns a negative number rather than throwing (display clamps at 0). */
export function daysOverdue(nextDueDate: string, today: string): number {
  const { year: ny, month: nm, day: nd } = parseISO(nextDueDate);
  const { year: ty, month: tm, day: td } = parseISO(today);
  const dueMs = Date.UTC(ny, nm - 1, nd);
  const todayMs = Date.UTC(ty, tm - 1, td);
  return Math.round((todayMs - dueMs) / 86_400_000);
}

/** Resume: the first occurrence STRICTLY AFTER `today`, by repeated `nextDueDate`. Never returns
 *  an accrued-overdue date, so reactivating a long-paused definition surfaces no backlog. Loop is
 *  hard-capped (weekly over a decade is ~520 iterations; cap 2000, then return the last value). */
export function nextFutureDueDate(current: string, frequency: Frequency, today: string): string {
  let cursor = current;
  let iterations = 0;
  while (cursor <= today && iterations < 2000) {
    cursor = nextDueDate(cursor, frequency);
    iterations += 1;
  }
  return cursor;
}
