// Vitest — pure `finance/domain/budget.ts` unit tests (design.md §8 "Unit (pure, no DB)",
// change: finance-budgets B-010). No DB dependency; every case here mirrors a server-side
// rule the pgTAP suite (supabase/tests/080_finance_budgets.sql) proves for real.

import { describe, expect, it } from "vitest";
import { budgetDeltaForEdit, evaluateBudgetImpact } from "@/modules/finance/domain";

describe("evaluateBudgetImpact", () => {
  it("does not prompt when the projection stays under the limit", () => {
    const impact = evaluateBudgetImpact({ limitCents: 5000, spentCents: 1000, deltaCents: 500 });
    expect(impact.crossesLimit).toBe(false);
    expect(impact.budgeted).toBe(true);
    expect(impact.limitCents).toBe(5000);
    expect(impact.projectedSpentCents).toBe(1500);
  });

  it("prompts exactly at the limit boundary (>=)", () => {
    const impact = evaluateBudgetImpact({ limitCents: 5000, spentCents: 4000, deltaCents: 1000 });
    expect(impact.crossesLimit).toBe(true);
    expect(impact.projectedSpentCents).toBe(5000);
  });

  it("prompts when the projection goes over the limit", () => {
    const impact = evaluateBudgetImpact({ limitCents: 5000, spentCents: 4000, deltaCents: 2000 });
    expect(impact.crossesLimit).toBe(true);
    expect(impact.projectedSpentCents).toBe(6000);
  });

  it("never prompts for an unbudgeted category (limitCents = null)", () => {
    const impact = evaluateBudgetImpact({ limitCents: null, spentCents: 4000, deltaCents: 5000 });
    expect(impact.crossesLimit).toBe(false);
    expect(impact.budgeted).toBe(false);
    expect(impact.limitCents).toBeNull();
  });

  it("never prompts for a zero delta, even when already over the limit", () => {
    const impact = evaluateBudgetImpact({ limitCents: 5000, spentCents: 6000, deltaCents: 0 });
    expect(impact.crossesLimit).toBe(false);
  });

  it("never prompts for a negative delta (lowering an amount), even when already over the limit", () => {
    const impact = evaluateBudgetImpact({ limitCents: 5000, spentCents: 6000, deltaCents: -1000 });
    expect(impact.crossesLimit).toBe(false);
    expect(impact.projectedSpentCents).toBe(5000);
  });
});

describe("budgetDeltaForEdit", () => {
  it("computes next - previous for a same-category edit", () => {
    const { categoryId, deltaCents } = budgetDeltaForEdit({
      previousCategoryId: "cat-1",
      previousAmountCents: 1000,
      nextCategoryId: "cat-1",
      nextAmountCents: 2000,
    });
    expect(categoryId).toBe("cat-1");
    expect(deltaCents).toBe(1000);
  });

  it("computes +next against the NEW category when the category changes", () => {
    const { categoryId, deltaCents } = budgetDeltaForEdit({
      previousCategoryId: "cat-old",
      previousAmountCents: 1000,
      nextCategoryId: "cat-new",
      nextAmountCents: 2000,
    });
    expect(categoryId).toBe("cat-new");
    expect(deltaCents).toBe(2000);
  });

  it("yields a zero delta for an unchanged submission", () => {
    const { deltaCents } = budgetDeltaForEdit({
      previousCategoryId: "cat-1",
      previousAmountCents: 1500,
      nextCategoryId: "cat-1",
      nextAmountCents: 1500,
    });
    expect(deltaCents).toBe(0);
  });

  it("does not re-check the old category when moving to an unbudgeted (null) category", () => {
    const { categoryId, deltaCents } = budgetDeltaForEdit({
      previousCategoryId: "cat-old",
      previousAmountCents: 1000,
      nextCategoryId: null,
      nextAmountCents: 1000,
    });
    expect(categoryId).toBeNull();
    expect(deltaCents).toBe(1000);
  });
});
