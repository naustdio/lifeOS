// Pure mirrors of the SQL clamp/due-date/derived-column logic added by
// `20260804090023_finance_credit_cards.sql` (design.md §1c/§1d, change: finance-credit-card-payments
// CC-017). Framework-free, no `server-only` — client components import this for previews. ISO
// `YYYY-MM-DD` strings in and out, UTC date construction throughout (`Date.UTC`), matching
// `domain/recurring.ts`'s own discipline so results never depend on the runtime's timezone.

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

/** Mirrors `finance.clamp_day_to_month(int, date)`: clamps a 1..31 day-of-month against the
 *  actual number of days in `monthStart`'s month (2026-02-01 + day 31 -> 2026-02-28). */
export function clampDueDay(day: number, monthStart: string): string {
  const { year, month } = parseISO(monthStart);
  const clamped = Math.min(day, daysInMonth(year, month));
  return formatISO({ year, month, day: clamped });
}

/** Mirrors `finance.next_card_due_date(int, date)`: the next occurrence of `dueDay` on/after
 *  `from`, this month if it hasn't passed yet, otherwise next month. `null` in, `null` out —
 *  the empty state (no terms configured) propagates rather than throwing. */
export function nextCardDueDate(dueDay: number | null, from: string): string | null {
  if (dueDay === null) {
    return null;
  }
  const { year, month } = parseISO(from);
  const thisMonth = clampDueDay(dueDay, formatISO({ year, month, day: 1 }));
  if (thisMonth >= from) {
    return thisMonth;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return clampDueDay(dueDay, formatISO({ year: nextYear, month: nextMonth, day: 1 }));
}

/** Whole days between `today` and `dueDate` (positive = future, 0 = today, negative = overdue).
 *  `null` in, `null` out — mirrors `nextDueDate`'s empty-state propagation. */
export function daysUntilDue(dueDate: string | null, today: string): number | null {
  if (dueDate === null) {
    return null;
  }
  const { year: dy, month: dm, day: dd } = parseISO(dueDate);
  const { year: ty, month: tm, day: td } = parseISO(today);
  const dueMs = Date.UTC(dy, dm - 1, dd);
  const todayMs = Date.UTC(ty, tm - 1, td);
  return Math.round((dueMs - todayMs) / 86_400_000);
}

/** Mirrors `credit_card_status.utilization_bp`: basis points of the limit currently owed.
 *  Returns `null` (never `NaN`/`Infinity`) when the limit is null or zero — the same NULL-safety
 *  the SQL view guarantees, so the UI never has to special-case a bad division. */
export function utilizationBp(owedCents: number, limitCents: number | null): number | null {
  if (limitCents === null || limitCents === 0) {
    return null;
  }
  return Math.trunc((owedCents * 10_000) / limitCents);
}

/** Mirrors `credit_card_status.over_limit`: `false` (never throws) whenever there is no limit
 *  to compare against. */
export function isOverLimit(owedCents: number, limitCents: number | null): boolean {
  if (limitCents === null) {
    return false;
  }
  return owedCents > limitCents;
}
