// RED-first (tasks.md 2.1) — `src/modules/recipes/domain/recipe.ts` did not exist when this was
// written. Mirrors `health/domain/event.ts`'s "pure predicates mirroring DB CHECK constraints"
// convention — zero Supabase/framework imports.

import { describe, expect, it } from "vitest";
import { isValidCategory, normalizePositions, reasonIsPresent, RECIPE_CATEGORIES } from "@/modules/recipes/domain/recipe";

describe("RECIPE_CATEGORIES / isValidCategory (mirrors recipes.recipes.category CHECK)", () => {
  it("accepts exactly the six fixed categories", () => {
    expect(RECIPE_CATEGORIES).toEqual(["desayuno", "comida", "cena", "postre", "snack", "complemento"]);
    for (const c of RECIPE_CATEGORIES) {
      expect(isValidCategory(c)).toBe(true);
    }
  });

  it("rejects anything outside the fixed set", () => {
    expect(isValidCategory("brunch")).toBe(false);
    expect(isValidCategory("")).toBe(false);
  });
});

describe("reasonIsPresent (mirrors recipe_changes.reason CHECK — length(btrim(reason)) >= 3)", () => {
  it("rejects null, empty, and whitespace-only", () => {
    expect(reasonIsPresent(null)).toBe(false);
    expect(reasonIsPresent("")).toBe(false);
    expect(reasonIsPresent("   ")).toBe(false);
    expect(reasonIsPresent("ab")).toBe(false); // below the 3-char DB minimum
  });

  it("accepts a real reason", () => {
    expect(reasonIsPresent("corrijo la cantidad de azucar")).toBe(true);
  });
});

describe("normalizePositions", () => {
  it("re-sequences a sparse/out-of-order position array to a contiguous 0-based sequence", () => {
    const items = [{ position: 5, name: "c" }, { position: 0, name: "a" }, { position: 2, name: "b" }];
    expect(normalizePositions(items).map((i) => i.position)).toEqual([0, 1, 2]);
    // order of the underlying items is preserved by original position order, not re-sorted content
    expect(normalizePositions(items).map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("leaves an already-contiguous sequence unchanged in content", () => {
    const items = [{ position: 0, name: "x" }, { position: 1, name: "y" }];
    expect(normalizePositions(items)).toEqual(items);
  });
});
