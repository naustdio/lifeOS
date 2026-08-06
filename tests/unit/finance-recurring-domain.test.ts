// Vitest — pure `finance/domain/recurring.ts` unit tests (design.md §11, change:
// finance-recurring R-011). No DB dependency. The month-end/leap-day/biweekly fixture set here
// is the SAME input/output matrix asserted against `finance.advance_due_date()` in
// `supabase/tests/090_finance_recurring.sql` — both layers must agree on the cursor.

import { describe, expect, it } from "vitest";
import { daysOverdue, nextDueDate, nextFutureDueDate } from "@/modules/finance/domain";

describe("nextDueDate", () => {
  it("monthly: normal case, same day next month", () => {
    expect(nextDueDate("2026-03-15", "monthly")).toBe("2026-04-15");
  });

  it("monthly: month-end clamp (Jan 31 -> Feb 28)", () => {
    expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("monthly: month-end clamp in a leap year (Jan 31 -> Feb 29)", () => {
    expect(nextDueDate("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("monthly: post-clamp drift is accepted (Feb 28 -> Mar 28, not restored to 31)", () => {
    expect(nextDueDate("2026-02-28", "monthly")).toBe("2026-03-28");
  });

  it("monthly: year rollover", () => {
    expect(nextDueDate("2026-12-31", "monthly")).toBe("2027-01-31");
  });

  it("weekly: +7 days across a month boundary", () => {
    expect(nextDueDate("2026-01-28", "weekly")).toBe("2026-02-04");
  });

  it("weekly: +7 days across a year boundary", () => {
    expect(nextDueDate("2026-12-28", "weekly")).toBe("2027-01-04");
  });

  it("biweekly: exactly 15 days, not '2 weeks' (14)", () => {
    expect(nextDueDate("2026-01-20", "biweekly")).toBe("2026-02-04");
  });

  it("yearly: same month/day next year", () => {
    expect(nextDueDate("2026-06-01", "yearly")).toBe("2027-06-01");
  });

  it("yearly: leap-day clamp to Feb 28 in a non-leap year", () => {
    expect(nextDueDate("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("is independent of the runtime timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Mexico_City";
      const mexico = nextDueDate("2026-01-31", "monthly");
      process.env.TZ = "UTC";
      const utc = nextDueDate("2026-01-31", "monthly");
      expect(mexico).toBe(utc);
      expect(mexico).toBe("2026-02-28");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("daysOverdue", () => {
  it("is 0 on the due date itself", () => {
    expect(daysOverdue("2026-08-06", "2026-08-06")).toBe(0);
  });

  it("is 12 when 12 days past the due date", () => {
    expect(daysOverdue("2026-07-25", "2026-08-06")).toBe(12);
  });

  it("is negative when the due date is in the future", () => {
    expect(daysOverdue("2026-08-20", "2026-08-06")).toBeLessThan(0);
  });

  it("is correct across a month boundary", () => {
    expect(daysOverdue("2026-07-31", "2026-08-02")).toBe(2);
  });

  it("is correct across a year boundary", () => {
    expect(daysOverdue("2025-12-30", "2026-01-02")).toBe(3);
  });
});

describe("nextFutureDueDate", () => {
  it("resumes a 4-month-paused monthly definition to the first date strictly after today, never an accrued past date", () => {
    const result = nextFutureDueDate("2026-04-01", "monthly", "2026-08-06");
    expect(result > "2026-08-06").toBe(true);
    expect(result).toBe("2026-09-01");
  });

  it("returns an already-future cursor unchanged", () => {
    expect(nextFutureDueDate("2026-09-01", "monthly", "2026-08-06")).toBe("2026-09-01");
  });

  it("terminates for a long-paused weekly definition without looping forever", () => {
    const result = nextFutureDueDate("2016-01-01", "weekly", "2026-08-06");
    expect(result > "2026-08-06").toBe(true);
  });
});
