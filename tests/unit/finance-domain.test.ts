// Vitest — pure `finance/domain` unit tests (design.md §9 "Unit (pure, no DB)", tasks.md T-024).
// No DB dependency; every case here mirrors a server-side rule the pgTAP suite proves for real.

import { describe, expect, it } from "vitest";
import {
  buildTransferPair,
  computeBalanceCents,
  deriveAccountClass,
  includedInAvailableCents,
  toSignedAmountCents,
  transferPairSumsToZero,
  validateCategoryShape,
} from "@/modules/finance/domain";
import { calendarMonthBounds, centsToPesos, formatCentsAsMXN, pesosToCents } from "@/shared/money";

describe("toSignedAmountCents", () => {
  it("keeps income positive", () => {
    expect(toSignedAmountCents("income", 5000)).toBe(5000);
  });
  it("negates expense", () => {
    expect(toSignedAmountCents("expense", 5000)).toBe(-5000);
  });
  it("rejects a non-positive magnitude", () => {
    expect(() => toSignedAmountCents("income", 0)).toThrow(RangeError);
    expect(() => toSignedAmountCents("expense", -10)).toThrow(RangeError);
  });
});

describe("computeBalanceCents", () => {
  it("sums opening balance and posted amounts", () => {
    expect(computeBalanceCents(100000, [-2000, -3000, 5000])).toBe(100000);
  });
  it("handles an empty transaction list", () => {
    expect(computeBalanceCents(42, [])).toBe(42);
  });
});

describe("buildTransferPair", () => {
  it("produces two opposite-sign legs sharing the group id", () => {
    const [from, to] = buildTransferPair({
      transferGroupId: "g1",
      fromAccountId: "a",
      toAccountId: "b",
      amountCents: 1000,
    });
    expect(from).toEqual({ transferGroupId: "g1", accountId: "a", amountCents: -1000 });
    expect(to).toEqual({ transferGroupId: "g1", accountId: "b", amountCents: 1000 });
  });
  it("sums to zero", () => {
    const pair = buildTransferPair({ transferGroupId: "g", fromAccountId: "a", toAccountId: "b", amountCents: 777 });
    expect(transferPairSumsToZero(pair)).toBe(true);
  });
  it("rejects a non-positive amount", () => {
    expect(() => buildTransferPair({ transferGroupId: "g", fromAccountId: "a", toAccountId: "b", amountCents: 0 })).toThrow(RangeError);
  });
  it("rejects identical accounts", () => {
    expect(() => buildTransferPair({ transferGroupId: "g", fromAccountId: "a", toAccountId: "a", amountCents: 100 })).toThrow(RangeError);
  });
});

describe("deriveAccountClass / includedInAvailableCents", () => {
  it("maps cash/checking/savings/savings_goal to asset", () => {
    for (const t of ["cash", "checking", "savings", "savings_goal"] as const) {
      expect(deriveAccountClass(t)).toBe("asset");
      expect(includedInAvailableCents(t)).toBe(true);
    }
  });
  it("maps credit_card/liability to liability, excluded from the hero", () => {
    for (const t of ["credit_card", "liability"] as const) {
      expect(deriveAccountClass(t)).toBe("liability");
      expect(includedInAvailableCents(t)).toBe(false);
    }
  });
});

describe("validateCategoryShape", () => {
  it("allows a top-level category", () => {
    expect(validateCategoryShape({ kind: "expense", parentId: null }, null)).toBeNull();
  });
  it("rejects nesting a category under a category that itself has a parent", () => {
    const grandparent = { id: "gp", kind: "expense" as const, parentId: null };
    const parent = { id: "p", kind: "expense" as const, parentId: grandparent.id };
    const error = validateCategoryShape({ kind: "expense", parentId: parent.id }, parent);
    expect(error).toMatch(/one level deep/);
  });
  it("rejects a child whose kind differs from its parent", () => {
    const parent = { id: "p", kind: "income" as const, parentId: null };
    const error = validateCategoryShape({ kind: "expense", parentId: parent.id }, parent);
    expect(error).toMatch(/share kind/);
  });
});

describe("es-MX MXN formatting", () => {
  it("formats a positive amount", () => {
    expect(formatCentsAsMXN(150000)).toBe("$1,500.00");
  });
  it("formats a negative amount with a leading minus", () => {
    expect(formatCentsAsMXN(-150000)).toMatch(/^-\$1,500\.00$/);
  });
  it("round-trips pesos <-> cents", () => {
    expect(centsToPesos(pesosToCents(19.99))).toBeCloseTo(19.99, 2);
  });
});

describe("calendarMonthBounds", () => {
  it("resolves day 1 to the end of the same month", () => {
    const { start, end } = calendarMonthBounds(new Date(2026, 1, 1)); // Feb 1, 2026
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(1); // still February
    expect(end.getDate()).toBe(28); // 2026 is not a leap year
  });
  it("resolves a mid-month date to that month's bounds", () => {
    const { start, end } = calendarMonthBounds(new Date(2026, 0, 15)); // Jan 15, 2026
    expect(start.getMonth()).toBe(0);
    expect(end.getDate()).toBe(31);
  });
});
