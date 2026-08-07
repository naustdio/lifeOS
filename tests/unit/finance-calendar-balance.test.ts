// Vitest — pure `finance/domain/calendar.ts` unit tests for `projectBalance()` and
// `buildMonthCells()` (design.md §2/§4, change: finance-calendar-projection K-005/K-006). No DB
// dependency. RED-first, same convention as finance-calendar-projection.test.ts.

import { describe, expect, it } from "vitest";
import type { ProjectableDefinition } from "@/modules/finance/domain/calendar";

const FROM_DATE = "2026-01-01";
const TO_DATE = "2026-04-01"; // FROM_DATE + 90 days (see finance-calendar-projection.test.ts header)

function def(overrides: Partial<ProjectableDefinition> & Pick<ProjectableDefinition, "id">): ProjectableDefinition {
  return {
    id: overrides.id,
    description: overrides.description ?? `def-${overrides.id}`,
    categoryId: overrides.categoryId ?? "cat-1",
    accountId: overrides.accountId ?? "acct-1",
    amountCents: overrides.amountCents ?? 1000,
    frequency: overrides.frequency ?? "monthly",
    nextDueDate: overrides.nextDueDate ?? FROM_DATE,
    active: overrides.active ?? true,
  };
}

describe("projectBalance — density and carry", () => {
  it("returns exactly horizonDays + 1 = 91 dense, contiguous days for the default horizon, starting at fromDate", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 500_00, FROM_DATE);
    expect(projection.days).toHaveLength(91);
    expect(projection.days[0].date).toBe(FROM_DATE);
    expect(projection.days[90].date).toBe(TO_DATE);
    for (let i = 1; i < projection.days.length; i += 1) {
      const prev = new Date(projection.days[i - 1].date);
      const cur = new Date(projection.days[i].date);
      expect((cur.getTime() - prev.getTime()) / 86_400_000).toBe(1);
    }
  });

  it("closingBalanceCents === anchorCents - cumulativeOutflowCents on every day", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance(
      [def({ id: "w1", frequency: "weekly", nextDueDate: FROM_DATE, amountCents: 5000 })],
      100_000,
      FROM_DATE,
    );
    for (const day of projection.days) {
      expect(day.closingBalanceCents).toBe(100_000 - day.cumulativeOutflowCents);
    }
  });

  it("cumulativeOutflowCents is monotonically non-decreasing", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance(
      [def({ id: "w1", frequency: "weekly", nextDueDate: FROM_DATE, amountCents: 5000 })],
      100_000,
      FROM_DATE,
    );
    for (let i = 1; i < projection.days.length; i += 1) {
      expect(projection.days[i].cumulativeOutflowCents).toBeGreaterThanOrEqual(projection.days[i - 1].cumulativeOutflowCents);
    }
  });

  it("zero active definitions produces a flat line at the anchor, with firstNegativeDate null", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 42_00, FROM_DATE);
    expect(projection.days.every((d) => d.closingBalanceCents === 42_00)).toBe(true);
    expect(projection.days.every((d) => d.outflowCents === 0)).toBe(true);
    expect(projection.firstNegativeDate).toBeNull();
  });

  it("an oversized charge sets firstNegativeDate to the exact correct day, not earlier or later", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    // anchor 10_00; a single 50_00 charge due on day 5 (2026-01-06) drives the balance negative
    // starting exactly that day.
    const projection = projectBalance(
      [def({ id: "big", frequency: "yearly", nextDueDate: "2026-01-06", amountCents: 50_00 })],
      10_00,
      FROM_DATE,
    );
    expect(projection.firstNegativeDate).toBe("2026-01-06");
    const dayBefore = projection.days.find((d) => d.date === "2026-01-05");
    expect(dayBefore?.isNegative).toBe(false);
  });

  it("a negative stored amountCents still reduces the balance (Math.abs normalization, Decision 9)", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance(
      [def({ id: "neg-amount", frequency: "yearly", nextDueDate: FROM_DATE, amountCents: -5000 })],
      10_000,
      FROM_DATE,
    );
    expect(projection.days[0].outflowCents).toBe(5000);
    expect(projection.days[0].closingBalanceCents).toBe(5000);
  });

  it("debtCents never enters the anchor and is absent from BalanceProjection", async () => {
    const { projectBalance } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 10_00, FROM_DATE);
    expect(Object.prototype.hasOwnProperty.call(projection, "debtCents")).toBe(false);
  });
});

describe("buildMonthCells — grid mapping (K-006)", () => {
  it("produces exactly one cell per day of the month, in ascending day order", async () => {
    const { projectBalance, buildMonthCells } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 0, FROM_DATE);
    const cells = buildMonthCells(projection, "2026-01");
    expect(cells).toHaveLength(31);
    expect(cells.map((c) => c.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it("a month starting on Sunday has its first cell's weekday computed as Sunday (2026-02: Feb 1 is a Sunday)", async () => {
    const { projectBalance, buildMonthCells } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 0, FROM_DATE, 120);
    const cells = buildMonthCells(projection, "2026-02");
    const weekday = new Date(Date.UTC(2026, 1, 1)).getUTCDay();
    expect(weekday).toBe(0); // Sunday
    expect(cells[0].date).toBe("2026-02-01");
    expect(cells).toHaveLength(28); // 2026 is not a leap year
  });

  it("a month starting on Saturday has its first cell's weekday computed as Saturday (2026-08: Aug 1 is a Saturday)", async () => {
    const { projectBalance, buildMonthCells } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 0, "2026-07-01", 365);
    const cells = buildMonthCells(projection, "2026-08");
    const weekday = new Date(Date.UTC(2026, 7, 1)).getUTCDay();
    expect(weekday).toBe(6); // Saturday
    expect(cells[0].date).toBe("2026-08-01");
  });

  it("handles 28/29/30/31-day months including a leap February", async () => {
    const { projectBalance, buildMonthCells } = await import("@/modules/finance/domain/calendar");
    const projection2026 = projectBalance([], 0, FROM_DATE, 365);
    expect(buildMonthCells(projection2026, "2026-02")).toHaveLength(28); // non-leap
    expect(buildMonthCells(projection2026, "2026-04")).toHaveLength(30);
    expect(buildMonthCells(projection2026, "2026-01")).toHaveLength(31);

    const projection2028 = projectBalance([], 0, "2028-01-01", 365);
    expect(buildMonthCells(projection2028, "2028-02")).toHaveLength(29); // leap year
  });

  it("flags days outside the horizon as inHorizon: false", async () => {
    const { projectBalance, buildMonthCells } = await import("@/modules/finance/domain/calendar");
    // horizon of 10 days from 2026-01-01 -> toDate = 2026-01-11; the rest of January is out of horizon.
    const projection = projectBalance([], 0, FROM_DATE, 10);
    const cells = buildMonthCells(projection, "2026-01");
    const inHorizonDays = cells.filter((c) => c.inHorizon).map((c) => c.day);
    expect(inHorizonDays).toEqual(Array.from({ length: 11 }, (_, i) => i + 1)); // days 1..11 inclusive
    expect(cells.find((c) => c.day === 12)?.inHorizon).toBe(false);
  });

  it("marks exactly one cell isToday, matching the projection's fromDate", async () => {
    const { projectBalance, buildMonthCells } = await import("@/modules/finance/domain/calendar");
    const projection = projectBalance([], 0, FROM_DATE, 90);
    const cells = buildMonthCells(projection, "2026-01");
    const todayCells = cells.filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date).toBe(FROM_DATE);
  });
});
