import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for `shopping_list.planner_slots` (design.md Open Question: planner scoping,
 * migration `20260819090000_shopping_list_planner_schema.sql` / `..._security.sql`, tasks.md
 * 6.3). Producer-only: this table carries NO item/checked/state column — "Agregar a mi lista"
 * writes into `shopping_list.items`/`lists` via the app-layer composition action (design.md
 * Decision 3), never through this repository. `recipeId` is NOT an FK (mirrors
 * `items.origin_recipe_id`) — `recipes` stays off-limits to this schema, so recipe titles are
 * resolved by the caller, not here.
 */
export const PLANNER_DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
export type PlannerDay = (typeof PLANNER_DAYS)[number];

export const PLANNER_MEAL_SLOTS = ["desayuno", "comida", "cena"] as const;
export type PlannerMealSlot = (typeof PLANNER_MEAL_SLOTS)[number];

export type PlannerSlot = {
  day: PlannerDay;
  mealSlot: PlannerMealSlot;
  recipeId: string;
};

function mapSlotRow(r: Record<string, unknown>): PlannerSlot {
  return {
    day: r.day as PlannerDay,
    mealSlot: r.meal_slot as PlannerMealSlot,
    recipeId: r.recipe_id as string,
  };
}

/** Every assigned slot for a household — at most one row per `(day, meal_slot)`, guaranteed by
 *  the table's composite primary key (spec `shopping-list-recipe-intake` "Weekly Planner Entry
 *  Point Is a Producer Only": "MUST assign at most one recipe per day/meal slot"). */
export async function listPlannerSlots(supabase: SupabaseClient, householdId: string): Promise<PlannerSlot[]> {
  const { data, error } = await supabase
    .schema("shopping_list")
    .from("planner_slots")
    .select("day, meal_slot, recipe_id")
    .eq("household_id", householdId);
  if (error || !data) return [];
  return data.map(mapSlotRow);
}

/** Assigns (or replaces) the recipe for one `(day, meal_slot)` — upserts on the composite primary
 *  key, so assigning a new recipe to an already-occupied slot overwrites it rather than adding a
 *  second one. */
export async function setPlannerSlot(
  supabase: SupabaseClient,
  householdId: string,
  day: PlannerDay,
  mealSlot: PlannerMealSlot,
  recipeId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("shopping_list")
    .from("planner_slots")
    .upsert(
      { household_id: householdId, day, meal_slot: mealSlot, recipe_id: recipeId },
      { onConflict: "household_id,day,meal_slot" },
    );
  return { error: error?.message ?? null };
}
