import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  FALLBACK_COLOR_KEY,
  FALLBACK_ICON_KEY,
  resolveCategoryColor,
  resolveCategoryIcon,
} from "@/design-system/tokens/category-style";

/**
 * Pure unit coverage for the icon/color registries (design.md §3, change:
 * finance-categories-icon-color C-006/C-007). RED-first: this test is written before
 * `category-style.ts` exists and must fail on import.
 */

// Copied verbatim from the migration's CHECK list
// (supabase/migrations/20260804090017_finance_category_style.sql) — this is the parity
// fixture that stops the registry and the database drifting.
const MIGRATION_ICON_KEYS = [
  "banknote",
  "briefcase",
  "trending-up",
  "gift",
  "coins",
  "utensils",
  "car",
  "house",
  "heart-pulse",
  "clapperboard",
  "graduation-cap",
  "shirt",
  "sparkles",
  "landmark",
  "tag",
  "shopping-cart",
  "chef-hat",
  "fuel",
  "bus",
  "wrench",
  "key",
  "zap",
  "wifi",
  "plane",
  "dumbbell",
  "baby",
  "paw-print",
  "smartphone",
  "book",
  "gamepad-2",
  "coffee",
  "credit-card",
  "circle-dashed",
];

const MIGRATION_COLOR_KEYS = [
  "neutral",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
];

describe("resolveCategoryIcon", () => {
  it("resolves a known key to its icon component", () => {
    expect(resolveCategoryIcon("utensils")).toBe(CATEGORY_ICONS.utensils);
  });

  it("is total: null, undefined, empty string, and unknown keys all resolve to the fallback, never undefined", () => {
    const inputs: Array<string | null | undefined> = [null, undefined, "", "not-a-real-icon"];
    for (const input of inputs) {
      const resolved = resolveCategoryIcon(input);
      expect(resolved).toBeDefined();
      expect(resolved).toBe(CATEGORY_ICONS[FALLBACK_ICON_KEY]);
    }
  });
});

describe("resolveCategoryColor", () => {
  it("resolves a known key to its semantic classes", () => {
    expect(resolveCategoryColor("blue")).toBe(CATEGORY_COLORS.blue);
  });

  it("is total: null, undefined, empty string, and unknown keys all resolve to the fallback, never undefined", () => {
    const inputs: Array<string | null | undefined> = [null, undefined, "", "not-a-real-color"];
    for (const input of inputs) {
      const resolved = resolveCategoryColor(input);
      expect(resolved).toBeDefined();
      expect(resolved).toBe(CATEGORY_COLORS[FALLBACK_COLOR_KEY]);
    }
  });
});

describe("registry/database parity", () => {
  it("every migration icon key has a registry entry, and vice versa", () => {
    const registryKeys = Object.keys(CATEGORY_ICONS).sort();
    expect(registryKeys).toEqual([...MIGRATION_ICON_KEYS].sort());
  });

  it("every migration color key has a registry entry, and vice versa", () => {
    const registryKeys = Object.keys(CATEGORY_COLORS).sort();
    expect(registryKeys).toEqual([...MIGRATION_COLOR_KEYS].sort());
  });

  it("no color class string contains a raw hex literal (check-tokens.mjs regression)", () => {
    for (const value of Object.values(CATEGORY_COLORS)) {
      expect(value.text).not.toContain("#");
      expect(value.surface).not.toContain("#");
    }
  });
});
