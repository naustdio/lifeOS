// Pure TypeScript mirror of `recipes.recipes`/`recipes.recipe_changes`'s CHECK constraints
// (design.md Schema, migration `20260813090039_recipes_schema.sql`). Zero Supabase/framework
// imports — a defensive client-side UX guard only; the DB remains the sole authority.

/** Mirrors `recipes.recipes.category` CHECK. */
export const RECIPE_CATEGORIES = ["desayuno", "comida", "cena", "postre", "snack"] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export function isValidCategory(value: string): value is RecipeCategory {
  return (RECIPE_CATEGORIES as readonly string[]).includes(value);
}

/** Mirrors `recipes.recipe_changes.reason` CHECK (`length(btrim(reason)) >= 3`) — the mandatory
 *  reason on every edit/soft-delete/hard-delete. */
export function reasonIsPresent(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.trim().length >= 3;
}

/** Re-sequences a possibly sparse/out-of-order `position` array to a contiguous 0-based sequence,
 *  ordered by original position — used before submitting ingredient/step rows to the seam so a
 *  dragged/removed row never leaves a gap the DB's `unique (recipe_id, position)` would reject. */
export function normalizePositions<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: index }));
}
