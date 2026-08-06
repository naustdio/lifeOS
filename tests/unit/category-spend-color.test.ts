import { describe, expect, it } from "vitest";
import {
  CATEGORY_BAR_CLASSES,
  categoryBarClass,
  categoryBarPercent,
} from "@/design-system/patterns/CategorySpendList";

/**
 * Pure unit coverage for `categoryBarClass`/`categoryBarPercent` (design.md §8, change:
 * finance-dashboard-feed F-010/F-008). No DOM, no DB.
 */
describe("categoryBarClass", () => {
  it("returns the same class for the same UUID across two calls", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(categoryBarClass(id)).toBe(categoryBarClass(id));
  });

  it("is keyed by the UUID, not by rank: reordering the input array does not change the color", () => {
    const idA = "11111111-1111-1111-1111-111111111111";
    const idB = "22222222-2222-2222-2222-222222222222";

    const colorAFirst = categoryBarClass(idA);
    const colorBFirst = categoryBarClass(idB);

    // Simulate idB overtaking idA in spend rank — the function receives only the id, never
    // an index/rank, so re-deriving after a reorder must be byte-identical.
    const rankedDesc = [idB, idA];
    const colorAAfterReorder = categoryBarClass(rankedDesc[1]);
    const colorBAfterReorder = categoryBarClass(rankedDesc[0]);

    expect(colorAAfterReorder).toBe(colorAFirst);
    expect(colorBAfterReorder).toBe(colorBFirst);
  });

  it("always returns a member of CATEGORY_BAR_CLASSES", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "z-random-uuid-1234"];
    for (const id of ids) {
      expect(CATEGORY_BAR_CLASSES).toContain(categoryBarClass(id));
    }
  });

  it("spreads distinct UUIDs across more than one palette entry", () => {
    const ids = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
      "55555555-5555-5555-5555-555555555555",
      "66666666-6666-6666-6666-666666666666",
    ];
    const colors = new Set(ids.map((id) => categoryBarClass(id)));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("does not throw on an empty string", () => {
    expect(() => categoryBarClass("")).not.toThrow();
    expect(CATEGORY_BAR_CLASSES).toContain(categoryBarClass(""));
  });

  it("never returns a class containing a raw hex literal", () => {
    const ids = ["a", "b", "c", "11111111-1111-1111-1111-111111111111"];
    for (const id of ids) {
      expect(categoryBarClass(id)).not.toContain("#");
    }
  });
});

describe("categoryBarPercent", () => {
  it("returns 100 for the top item", () => {
    expect(categoryBarPercent(1000, 1000)).toBe(100);
  });

  it("returns 50 for half the top item", () => {
    expect(categoryBarPercent(500, 1000)).toBe(50);
  });

  it("returns a 2% sliver for a 1-cent item against a large top item, never 0", () => {
    expect(categoryBarPercent(1, 100000)).toBe(2);
  });

  it("returns 0 (never NaN) when maxCents is 0", () => {
    const pct = categoryBarPercent(0, 0);
    expect(pct).toBe(0);
    expect(Number.isNaN(pct)).toBe(false);
  });
});
