// Vitest — pure `finance/domain/calendar.ts` unit tests for `projectMonthOutflow()` (design.md
// "Current-Month Prospected-Spend Summary", change: finance-subscriptions). RED-first: this file
// is written before `projectMonthOutflow` exists.
//
// `FROM_DATE = "2026-08-15"` is the fixed anchor for every fixture in this file (mid-August 2026,
// a 31-day month) so the "rest of the month" window is easy to reason about by hand:
// `toDate = "2026-08-31"`.

import { describe, expect, it } from "vitest";
import type { ProjectableDefinition } from "@/modules/finance/domain/calendar";

const FROM_DATE = "2026-08-15";

function def(overrides: Partial<ProjectableDefinition> & Pick<ProjectableDefinition, "id">): ProjectableDefinition {
  return {
    id: overrides.id,
    description: overrides.description ?? `def-${overrides.id}`,
    categoryId: overrides.categoryId ?? "cat-1",
    accountId: overrides.accountId ?? "acct-1",
    amountCents: overrides.amountCents ?? 1000,
    kind: overrides.kind ?? "outflow",
    frequency: overrides.frequency ?? "monthly",
    nextDueDate: overrides.nextDueDate ?? FROM_DATE,
    active: overrides.active ?? true,
  };
}

describe("projectMonthOutflow", () => {
  it("sums only on-schedule outflow occurrences from today through month end", async () => {
    const { projectMonthOutflow } = await import("@/modules/finance/domain/calendar");
    const result = projectMonthOutflow(
      [
        def({ id: "e1", kind: "outflow", amountCents: 5000, frequency: "yearly", nextDueDate: FROM_DATE }),
        def({ id: "e2", kind: "outflow", amountCents: 3000, frequency: "yearly", nextDueDate: "2026-08-20" }),
        def({ id: "i1", kind: "inflow", amountCents: 9000, frequency: "yearly", nextDueDate: "2026-08-25" }),
      ],
      FROM_DATE,
    );
    expect(result.totalCents).toBe(8000);
    expect(result.occurrenceCount).toBe(2);
    expect(result.fromDate).toBe(FROM_DATE);
    expect(result.toDate).toBe("2026-08-31");
    expect(result.month).toBe("2026-08");
  });

  it("excludes the folded overdue backlog occurrence at fromDate", async () => {
    const { projectMonthOutflow } = await import("@/modules/finance/domain/calendar");
    const result = projectMonthOutflow(
      [
        // Overdue by 3 months: folds into exactly ONE occurrence at fromDate with overdue: true —
        // that folded occurrence must NEVER contribute to totalCents.
        def({ id: "overdue", kind: "outflow", amountCents: 7000, frequency: "monthly", nextDueDate: "2026-05-15" }),
      ],
      FROM_DATE,
    );
    expect(result.totalCents).toBe(0);
    expect(result.occurrenceCount).toBe(0);
  });

  it("excludes occurrences that land beyond the current month", async () => {
    const { projectMonthOutflow } = await import("@/modules/finance/domain/calendar");
    const result = projectMonthOutflow(
      [def({ id: "next-month", kind: "outflow", amountCents: 4000, frequency: "monthly", nextDueDate: "2026-09-01" })],
      FROM_DATE,
    );
    expect(result.totalCents).toBe(0);
    expect(result.occurrenceCount).toBe(0);
  });

  it("returns a zero total for zero definitions — a valid state, not an error", async () => {
    const { projectMonthOutflow } = await import("@/modules/finance/domain/calendar");
    const result = projectMonthOutflow([], FROM_DATE);
    expect(result.totalCents).toBe(0);
    expect(result.occurrenceCount).toBe(0);
  });

  it("is unaffected by which occurrences would otherwise be paused — inactive definitions contribute nothing", async () => {
    const { projectMonthOutflow } = await import("@/modules/finance/domain/calendar");
    const result = projectMonthOutflow(
      [def({ id: "paused", kind: "outflow", amountCents: 6000, active: false, frequency: "monthly", nextDueDate: "2026-08-20" })],
      FROM_DATE,
    );
    expect(result.totalCents).toBe(0);
    expect(result.occurrenceCount).toBe(0);
  });

  /**
   * Closes a real spec/test coverage gap flagged by sdd-verify (finance-subscriptions, finding
   * C1 — scenario 1.4 "Summary unaffected by the subscription marker"). Previously discharged
   * only by types: `ProjectableDefinition` has no `isSubscription` field, so it is structurally
   * impossible for `projectMonthOutflow` to see it. This proves it at runtime too: two
   * otherwise-identical expense definitions, one carrying `isSubscription: true` (as
   * `RecurringListItem`-shaped callers of `projectMonthOutflow` may pass, since the domain type
   * is a structural subset — design.md §2) and one carrying `isSubscription: false` (matching
   * how `createRecurringDefinition` callers normally omit the flag), must contribute identically
   * to the total.
   */
  it("summary total is identical whether or not a definition carries the isSubscription marker", async () => {
    const { projectMonthOutflow } = await import("@/modules/finance/domain/calendar");
    const subscriptionFlagged = { ...def({ id: "sub", kind: "outflow", amountCents: 4000, frequency: "monthly", nextDueDate: FROM_DATE }), isSubscription: true };
    const subscriptionUnflagged = { ...def({ id: "sub", kind: "outflow", amountCents: 4000, frequency: "monthly", nextDueDate: FROM_DATE }), isSubscription: false };

    const flaggedResult = projectMonthOutflow([subscriptionFlagged], FROM_DATE);
    const unflaggedResult = projectMonthOutflow([subscriptionUnflagged], FROM_DATE);
    expect(flaggedResult.totalCents).toBe(unflaggedResult.totalCents);
    expect(flaggedResult.occurrenceCount).toBe(unflaggedResult.occurrenceCount);

    // Combining both in one call: the total is simply the sum of both amounts, with no
    // distinction drawn by the marker.
    const combined = projectMonthOutflow(
      [
        { ...subscriptionFlagged, id: "sub-flagged" },
        { ...subscriptionUnflagged, id: "sub-unflagged" },
      ],
      FROM_DATE,
    );
    expect(combined.totalCents).toBe(8000);
    expect(combined.occurrenceCount).toBe(2);
  });
});
