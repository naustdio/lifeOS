// Vitest — pure `finance/domain/calendar.ts` unit tests for `projectOccurrences()` (design.md §2,
// change: finance-calendar-projection K-002/K-003). No DB dependency. RED-first: this file is
// written before `domain/calendar.ts` exists (K-004) — the critical-logic surface this project's
// non-blanket-TDD convention gates (tasks.md header).
//
// `fromDate = "2026-01-01"` is used as the fixed anchor for every fixture in this file so every
// expected date is computed by hand once (in these comments) rather than depending on "today".
// With the default `horizonDays = 90`, `toDate = fromDate + 90 days = "2026-04-01"`
// (Jan has 31 days covering offsets 0-30, Feb 2026 [non-leap] 28 days covering offsets 31-58,
// March 31 days covering offsets 59-89, so offset 90 lands on April 1).

import { describe, expect, it, vi } from "vitest";
import type { ProjectableDefinition } from "@/modules/finance/domain/calendar";

const FROM_DATE = "2026-01-01";
const TO_DATE = "2026-04-01"; // FROM_DATE + 90 days, see header comment

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

describe("projectOccurrences — expansion", () => {
  it("expands a weekly definition to 13 occurrences within the 90-day window", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "w1", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE);
    const dates = result.map((o) => o.date);
    expect(dates).toEqual([
      "2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29",
      "2026-02-05", "2026-02-12", "2026-02-19", "2026-02-26",
      "2026-03-05", "2026-03-12", "2026-03-19", "2026-03-26",
    ]);
    expect(dates.length).toBe(13);
    expect(dates.every((d) => d <= TO_DATE)).toBe(true);
  });

  it("expands a monthly definition anchored on the 1st across the window, including the boundary day", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "m1", frequency: "monthly", nextDueDate: FROM_DATE })], FROM_DATE);
    expect(result.map((o) => o.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("expands a biweekly definition at the fixed 15-day interval", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "b1", frequency: "biweekly", nextDueDate: FROM_DATE })], FROM_DATE);
    expect(result.map((o) => o.date)).toEqual([
      "2026-01-01", "2026-01-16", "2026-01-31", "2026-02-15", "2026-03-02", "2026-03-17", "2026-04-01",
    ]);
  });

  it("expands a yearly definition to a single occurrence within a 90-day window", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "y1", frequency: "yearly", nextDueDate: FROM_DATE })], FROM_DATE);
    expect(result.map((o) => o.date)).toEqual(["2026-01-01"]);
  });

  it("monthly anchored 2026-01-31 clamps to 2026-02-28 then DRIFTS to 2026-03-28 (inherited nextDueDate behavior, not fought)", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "drift", frequency: "monthly", nextDueDate: "2026-01-31" })], FROM_DATE);
    expect(result.map((o) => o.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-28"]);
  });

  it("a definition due exactly on fromDate lands in day 0 with overdue: false", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "today", frequency: "monthly", nextDueDate: FROM_DATE })], FROM_DATE);
    expect(result[0]).toMatchObject({ date: FROM_DATE, scheduledDate: FROM_DATE, overdue: false });
  });

  it("a paused (active: false) definition never appears in the output", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences(
      [
        def({ id: "paused", active: false, frequency: "weekly", nextDueDate: FROM_DATE }),
        def({ id: "active", active: true, frequency: "weekly", nextDueDate: FROM_DATE }),
      ],
      FROM_DATE,
    );
    expect(result.some((o) => o.definitionId === "paused")).toBe(false);
    expect(result.some((o) => o.definitionId === "active")).toBe(true);
  });

  it("empty definitions input returns an empty array", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    expect(projectOccurrences([], FROM_DATE)).toEqual([]);
  });

  it("orders output deterministically by (date asc, description asc, definitionId asc)", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences(
      [
        def({ id: "z-id", description: "Zeta", frequency: "yearly", nextDueDate: FROM_DATE }),
        def({ id: "a-id", description: "Alpha", frequency: "yearly", nextDueDate: FROM_DATE }),
        def({ id: "m-id", description: "Alpha", frequency: "yearly", nextDueDate: FROM_DATE }), // same date+desc, ties on id
      ],
      FROM_DATE,
    );
    expect(result.map((o) => o.definitionId)).toEqual(["a-id", "m-id", "z-id"]);
  });
});

describe("projectOccurrences — bounds and regressions (K-003)", () => {
  it("a definition 3 months overdue yields exactly ONE folded occurrence at fromDate, and its next occurrence is strictly after fromDate", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const anchor = "2026-08-06";
    const result = projectOccurrences(
      [def({ id: "overdue", frequency: "monthly", nextDueDate: "2026-05-06" })],
      anchor,
      120,
    );
    const forThisDef = result.filter((o) => o.definitionId === "overdue");
    const onOrBeforeAnchor = forThisDef.filter((o) => o.date <= anchor);
    expect(onOrBeforeAnchor).toHaveLength(1);
    expect(onOrBeforeAnchor[0]).toMatchObject({ date: anchor, scheduledDate: "2026-05-06", overdue: true });
    const strictlyAfter = forThisDef.filter((o) => o.date > anchor);
    expect(strictlyAfter.every((o) => o.date > anchor)).toBe(true);
    expect(strictlyAfter.length).toBeGreaterThan(0);
  });

  it("terminates via the strict-monotonic guard instead of hanging when a cursor cannot advance (defensive — not reachable through the 4 real frequencies)", async () => {
    vi.resetModules();
    vi.doMock("@/modules/finance/domain/recurring", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/modules/finance/domain/recurring")>();
      return { ...actual, nextDueDate: vi.fn((cursor: string) => cursor) };
    });
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "stuck", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(FROM_DATE);
    vi.doUnmock("@/modules/finance/domain/recurring");
    vi.resetModules();
  });

  it("never emits more than MAX_OCCURRENCES_PER_DEFINITION occurrences for a single definition", async () => {
    vi.resetModules();
    vi.doMock("@/modules/finance/domain/recurring", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/modules/finance/domain/recurring")>();
      return { ...actual, nextDueDate: vi.fn((cursor: string) => {
        const [y, m, d] = cursor.split("-").map(Number);
        const next = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
        return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
      }) };
    });
    const { projectOccurrences, MAX_OCCURRENCES_PER_DEFINITION } = await import("@/modules/finance/domain/calendar");
    const result = projectOccurrences([def({ id: "dense", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE, 365);
    expect(result.length).toBe(MAX_OCCURRENCES_PER_DEFINITION);
    vi.doUnmock("@/modules/finance/domain/recurring");
    vi.resetModules();
  });

  it("clamps horizonDays into [0, MAX_HORIZON_DAYS]", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const negative = projectOccurrences([def({ id: "neg", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE, -10);
    expect(negative.every((o) => o.date === FROM_DATE)).toBe(true);

    const tooLarge = projectOccurrences([def({ id: "big", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE, 99999);
    const maxDate = tooLarge.reduce((max, o) => (o.date > max ? o.date : max), FROM_DATE);
    expect(maxDate <= "2027-01-01").toBe(true); // FROM_DATE + 365 days
  });

  it("an unrecognized frequency skips the row instead of throwing — named regression for the server-render 500 (design.md §6 Decision 5)", async () => {
    const { projectOccurrences } = await import("@/modules/finance/domain/calendar");
    const hostile = def({ id: "bad-freq", nextDueDate: FROM_DATE }) as ProjectableDefinition;
    // Cast past the type system to simulate a corrupt/legacy DB row — the whole point of the test.
    (hostile as unknown as { frequency: string }).frequency = "daily";
    expect(() =>
      projectOccurrences([hostile, def({ id: "good", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE),
    ).not.toThrow();
    const result = projectOccurrences([hostile, def({ id: "good", frequency: "weekly", nextDueDate: FROM_DATE })], FROM_DATE);
    expect(result.some((o) => o.definitionId === "bad-freq")).toBe(false);
    expect(result.some((o) => o.definitionId === "good")).toBe(true);
  });
});
