// RED-first (tasks.md 2.1) — `src/modules/shopping-list/domain/combine.ts` does not exist yet.
// Zero codebase precedent for this logic (design.md: "zero codebase precedent"), so this is the
// most detailed test coverage in this whole change. Pure function, zero Supabase/framework
// imports — mirrors `tests/unit/recipe-domain.test.ts`'s "pure predicates" convention.
//
// spec: `shopping-list-recipe-intake` "Quantity Combining With Origin Breakdown" — all 3 scenarios.

import { describe, expect, it } from "vitest";
import { combineItems, type ShoppingListItemRow } from "@/modules/shopping-list/domain/combine";

function item(overrides: Partial<ShoppingListItemRow> & { id: string }): ShoppingListItemRow {
  return {
    id: overrides.id,
    name: overrides.name ?? "Cebolla",
    quantity: "quantity" in overrides ? (overrides.quantity ?? null) : 1,
    unit: overrides.unit ?? "pieza",
    estimatedUnitCost: overrides.estimatedUnitCost ?? null,
    storeTypeId: overrides.storeTypeId ?? null,
    isChecked: overrides.isChecked ?? false,
    originRecipeTitle: overrides.originRecipeTitle ?? null,
    createdAt: overrides.createdAt ?? "2026-08-01T00:00:00.000Z",
  };
}

describe("combineItems (shopping-list-recipe-intake: Quantity Combining With Origin Breakdown)", () => {
  it("same name+unit from two recipes combine into one line + origin sub-line", () => {
    const items: ShoppingListItemRow[] = [
      item({ id: "a", name: "Cebolla", unit: "pieza", quantity: 2, originRecipeTitle: "Sopa", createdAt: "2026-08-01T00:00:00.000Z" }),
      item({ id: "b", name: "cebolla", unit: "Pieza", quantity: 3, originRecipeTitle: "Ensalada", createdAt: "2026-08-01T01:00:00.000Z" }),
    ];

    const lines = combineItems(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe("Cebolla");
    expect(lines[0]!.unit).toBe("pieza");
    expect(lines[0]!.totalQuantity).toBe(5);
    expect(lines[0]!.contributors).toHaveLength(2);
    expect(lines[0]!.contributors.map((c) => c.originLabel)).toEqual(["Sopa", "Ensalada"]);
  });

  it('loose (manual) contributors are labeled "manual"', () => {
    const items: ShoppingListItemRow[] = [
      item({ id: "a", name: "Leche", unit: "litro", quantity: 1, originRecipeTitle: "Pan" }),
      item({ id: "b", name: "Leche", unit: "litro", quantity: 2, originRecipeTitle: null }),
    ];

    const lines = combineItems(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.totalQuantity).toBe(3);
    expect(lines[0]!.contributors.map((c) => c.originLabel)).toEqual(["Pan", "manual"]);
  });

  it("same name, different units stay separate, no conversion", () => {
    const items: ShoppingListItemRow[] = [
      item({ id: "a", name: "Harina", unit: "kg", quantity: 1 }),
      item({ id: "b", name: "Harina", unit: "taza", quantity: 2 }),
    ];

    const lines = combineItems(items);
    expect(lines).toHaveLength(2);
    const units = lines.map((l) => l.unit).sort();
    expect(units).toEqual(["kg", "taza"]);
  });

  it("a null-quantity contributor (\"al gusto\") does not poison the total unless every contributor is null", () => {
    const items: ShoppingListItemRow[] = [
      item({ id: "a", name: "Sal", unit: "al gusto", quantity: null }),
      item({ id: "b", name: "Sal", unit: "al gusto", quantity: 2 }),
    ];
    const lines = combineItems(items);
    expect(lines[0]!.totalQuantity).toBe(2);

    const allNull: ShoppingListItemRow[] = [
      item({ id: "c", name: "Pimienta", unit: "al gusto", quantity: null }),
      item({ id: "d", name: "Pimienta", unit: "al gusto", quantity: null }),
    ];
    expect(combineItems(allNull)[0]!.totalQuantity).toBeNull();
  });

  it("allChecked is true only when every contributor is checked", () => {
    const items: ShoppingListItemRow[] = [
      item({ id: "a", name: "Ajo", unit: "diente", isChecked: true }),
      item({ id: "b", name: "Ajo", unit: "diente", isChecked: false }),
    ];
    expect(combineItems(items)[0]!.allChecked).toBe(false);
    expect(combineItems([item({ id: "c", name: "Ajo", unit: "diente", isChecked: true })])[0]!.allChecked).toBe(true);
  });

  it("storeTypeId resolves to the first non-null contributor", () => {
    const items: ShoppingListItemRow[] = [
      item({ id: "a", name: "Queso", unit: "pieza", storeTypeId: null, createdAt: "2026-08-01T00:00:00.000Z" }),
      item({ id: "b", name: "Queso", unit: "pieza", storeTypeId: "store-1", createdAt: "2026-08-01T01:00:00.000Z" }),
    ];
    expect(combineItems(items)[0]!.storeTypeId).toBe("store-1");
  });
});
