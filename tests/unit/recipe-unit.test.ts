// RED-first (tasks.md 2.3) — `src/modules/recipes/domain/unit.ts` did not exist when this was
// written.

import { describe, expect, it } from "vitest";
import { mergeUnitOptions, RECIPE_UNITS } from "@/modules/recipes/domain/unit";

describe("RECIPE_UNITS (mirrors recipes.is_builtin_unit's array literal)", () => {
  it("has exactly the 14 extended built-in units, each with an icon", () => {
    expect(RECIPE_UNITS.map((u) => u.value)).toEqual([
      "g", "kg", "ml", "l", "taza", "cucharada", "cucharadita", "pieza", "pizca",
      "oz", "lb", "diente", "manojo", "al gusto",
    ]);
    for (const u of RECIPE_UNITS) {
      expect(u.icon).toBeTruthy();
    }
  });
});

describe("mergeUnitOptions", () => {
  it("returns the built-in list plus any custom units not already present", () => {
    const merged = mergeUnitOptions(RECIPE_UNITS, ["cdta", "pizca"]);
    const values = merged.map((u) => u.value);
    expect(values).toContain("cdta");
    // "pizca" is already a built-in — must not be duplicated.
    expect(values.filter((v) => v === "pizca")).toHaveLength(1);
  });

  it("custom units carry the neutral fallback icon", () => {
    const merged = mergeUnitOptions(RECIPE_UNITS, ["rebanada"]);
    const custom = merged.find((u) => u.value === "rebanada");
    expect(custom?.icon).toBeTruthy();
    expect(custom?.isCustom).toBe(true);
  });

  it("de-duplicates repeated custom entries", () => {
    const merged = mergeUnitOptions(RECIPE_UNITS, ["rebanada", "rebanada"]);
    expect(merged.filter((u) => u.value === "rebanada")).toHaveLength(1);
  });
});
