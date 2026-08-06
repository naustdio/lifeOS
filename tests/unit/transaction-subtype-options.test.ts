import { describe, expect, it } from "vitest";
import { TRANSACTION_SUBTYPE_ICONS } from "@/design-system/tokens/transaction-subtype-style";
import { SUBTYPE_OPTIONS_BY_TAB, subtypeOptionsForType } from "@/app/(app)/movimientos/subtype-options";

/**
 * Pure unit coverage for the per-tab/per-type sub-type option lists (design.md §6, change:
 * finance-transaction-subtypes, tasks.md T-007). RED-first: this test is written before
 * `subtype-options.ts` exists and must fail on import.
 */

describe("SUBTYPE_OPTIONS_BY_TAB", () => {
  it("expense tab maps to exactly [pago]", () => {
    expect(SUBTYPE_OPTIONS_BY_TAB.expense.map((o) => o.key)).toEqual(["pago"]);
  });

  it("income tab maps to exactly [reembolso, devolucion_efectivo]", () => {
    expect(SUBTYPE_OPTIONS_BY_TAB.income.map((o) => o.key)).toEqual(["reembolso", "devolucion_efectivo"]);
  });

  it("transfer tab maps to exactly [pago_tarjeta]", () => {
    expect(SUBTYPE_OPTIONS_BY_TAB.transfer.map((o) => o.key)).toEqual(["pago_tarjeta"]);
  });

  it("compra_meses is excluded from every tab's option list", () => {
    const allKeys = Object.values(SUBTYPE_OPTIONS_BY_TAB).flatMap((options) => options.map((o) => o.key));
    expect(allKeys).not.toContain("compra_meses");
  });

  it("every option key is a valid registry key", () => {
    const allKeys = Object.values(SUBTYPE_OPTIONS_BY_TAB).flatMap((options) => options.map((o) => o.key));
    for (const key of allKeys) {
      expect(key in TRANSACTION_SUBTYPE_ICONS).toBe(true);
    }
  });

  it("every option carries a non-empty Spanish label", () => {
    const allOptions = Object.values(SUBTYPE_OPTIONS_BY_TAB).flat();
    for (const option of allOptions) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("subtypeOptionsForType", () => {
  it("maps 'expense' the same as the expense tab", () => {
    expect(subtypeOptionsForType("expense")).toEqual(SUBTYPE_OPTIONS_BY_TAB.expense);
  });

  it("maps 'income' the same as the income tab", () => {
    expect(subtypeOptionsForType("income")).toEqual(SUBTYPE_OPTIONS_BY_TAB.income);
  });

  it("maps 'transfer' the same as the transfer tab", () => {
    expect(subtypeOptionsForType("transfer")).toEqual(SUBTYPE_OPTIONS_BY_TAB.transfer);
  });
});
