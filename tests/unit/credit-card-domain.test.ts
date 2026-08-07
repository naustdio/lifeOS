// Vitest — pure `finance/domain/credit-card.ts` unit tests (tasks.md CC-016, design.md §1c/§1d,
// §3). RED-first per this project's TDD policy: `credit-card.ts` is a named critical-logic
// surface. `clampDueDay`/`nextDueDate` MUST agree with the same fixture table as
// `0xx_finance_credit_cards.sql`'s pgTAP day-clamp assertions; `utilizationBp` MUST return
// `null` (never `NaN`/`Infinity`) on a null/zero limit — the TS-side proof that the empty state
// never crashes.

import { describe, expect, it } from "vitest";
import {
  clampDueDay,
  daysUntilDue,
  isOverLimit,
  nextCardDueDate,
  utilizationBp,
} from "@/modules/finance/domain";

describe("clampDueDay", () => {
  it("clamps day 31 to the 28th in a non-leap February", () => {
    expect(clampDueDay(31, "2026-02-01")).toBe("2026-02-28");
  });

  it("clamps day 31 to the 29th in a leap-year February", () => {
    expect(clampDueDay(31, "2028-02-01")).toBe("2028-02-29");
  });

  it("does not clamp a day that fits the month", () => {
    expect(clampDueDay(15, "2026-08-01")).toBe("2026-08-15");
  });
});

describe("nextCardDueDate", () => {
  it("mirrors finance.next_card_due_date: due_day 31 in Feb 2026 clamps to the 28th", () => {
    expect(nextCardDueDate(31, "2026-02-10")).toBe("2026-02-28");
  });

  it("mirrors finance.next_card_due_date: due_day 31 in Feb 2028 (leap) clamps to the 29th", () => {
    expect(nextCardDueDate(31, "2028-02-01")).toBe("2028-02-29");
  });

  it("rolls to next month when due_day already passed this month", () => {
    expect(nextCardDueDate(15, "2026-08-20")).toBe("2026-09-15");
  });

  it("resolves to today when due_day equals today's day", () => {
    expect(nextCardDueDate(20, "2026-08-20")).toBe("2026-08-20");
  });

  it("returns null when due_day is null (no terms configured)", () => {
    expect(nextCardDueDate(null, "2026-08-20")).toBeNull();
  });
});

describe("daysUntilDue", () => {
  it("returns a positive count of days for a future due date", () => {
    expect(daysUntilDue("2026-08-27", "2026-08-20")).toBe(7);
  });

  it("returns 0 on the due date itself", () => {
    expect(daysUntilDue("2026-08-20", "2026-08-20")).toBe(0);
  });

  it("returns a negative count for an overdue due date", () => {
    expect(daysUntilDue("2026-08-15", "2026-08-20")).toBe(-5);
  });

  it("returns null when nextDueDate is null (no terms configured)", () => {
    expect(daysUntilDue(null, "2026-08-20")).toBeNull();
  });
});

describe("utilizationBp", () => {
  it("computes basis points of the limit that are owed", () => {
    expect(utilizationBp(250_000, 500_000)).toBe(5_000); // 50.00%
  });

  it("returns null (never NaN) when the limit is null", () => {
    expect(utilizationBp(250_000, null)).toBeNull();
  });

  it("returns null (never Infinity) when the limit is zero", () => {
    expect(utilizationBp(250_000, 0)).toBeNull();
  });

  it("returns 0 when nothing is owed", () => {
    expect(utilizationBp(0, 500_000)).toBe(0);
  });
});

describe("isOverLimit", () => {
  it("is true when owed exceeds the limit", () => {
    expect(isOverLimit(600_000, 500_000)).toBe(true);
  });

  it("is false when owed is within the limit", () => {
    expect(isOverLimit(400_000, 500_000)).toBe(false);
  });

  it("is false (never throws) when the limit is null", () => {
    expect(isOverLimit(400_000, null)).toBe(false);
  });
});
