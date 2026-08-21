// RED-first (tasks.md 2.3) — `src/modules/shopping-list/domain/scale.ts` does not exist yet.
// `scaleQuantity` is verbatim the same ratio formula already established at
// `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx:206`
// (`scaleRatio = recipe.portions > 0 ? targetPortions / recipe.portions : 1`).

import { describe, expect, it } from "vitest";
import { estimatedTotal, scaleQuantity } from "@/modules/shopping-list/domain/scale";

describe("scaleQuantity (shopping-list-recipe-intake: portion-scaling, RecipeDetail.tsx:206 formula)", () => {
  it("scales 200 @ base 4 -> target 8 = 400", () => {
    expect(scaleQuantity(200, 8, 4)).toBe(400);
  });

  it("guards a zero base portions by treating the ratio as 1 (no scaling)", () => {
    expect(scaleQuantity(10, 8, 0)).toBe(10);
  });

  it("passes null quantity through unchanged", () => {
    expect(scaleQuantity(null, 8, 4)).toBeNull();
  });
});

describe("estimatedTotal (shopping-list-continuous: Estimated Total Cost)", () => {
  it("sums quantity * estimatedUnitCost only over priced items, unpriced excluded without error", () => {
    const total = estimatedTotal([
      { quantity: 2, estimatedUnitCost: 10 },
      { quantity: 3, estimatedUnitCost: null },
      { quantity: null, estimatedUnitCost: 5 },
      { quantity: 1, estimatedUnitCost: 4.5 },
    ]);
    expect(total).toBe(24.5);
  });

  it("returns 0 when no item is priced", () => {
    expect(estimatedTotal([{ quantity: 2, estimatedUnitCost: null }])).toBe(0);
  });
});
