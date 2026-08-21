"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import * as recipesApi from "@/modules/recipes/api";
import * as shoppingApi from "@/modules/shopping-list/api";
import { createClient } from "@/shared/supabase/server";
import { generateFromRecipesAction } from "../lista-de-compras/actions";

const ERROR_COPY = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
  NO_SLOT: "No hay una receta asignada a este espacio.",
  RECIPE_NOT_FOUND: "No se encontró la receta asignada.",
};

/**
 * Server Actions for `/planificador` (Phase 6, design.md Decision 3). Producer-only: this file
 * only ever WRITES `planner_slots` (`assignSlotAction`) or reads it to resolve which recipe to
 * add (`addSlotToListAction`) — it never touches `shopping_list.items`/`lists` directly. Adding
 * from the planner literally reuses `generateFromRecipesAction` from `lista-de-compras/actions.ts`
 * (same app-layer import shape already used by `RecipeDetail.tsx`), so it feeds the SAME
 * continuous list through the SAME code path — not a second list system.
 */

/** Assigns (or replaces) the recipe for one day/meal slot (spec `shopping-list-recipe-intake`
 *  "Weekly Planner Entry Point Is a Producer Only": "MUST assign at most one recipe per day/meal
 *  slot" — enforced by `planner_slots`' composite primary key via `setPlannerSlot`'s upsert). */
export async function assignSlotAction(
  day: shoppingApi.PlannerDay,
  mealSlot: shoppingApi.PlannerMealSlot,
  recipeId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const { error } = await shoppingApi.setPlannerSlot(supabase, spaceId, day, mealSlot, recipeId);
  if (error) return { error };

  revalidatePath("/planificador");
  return { error: null };
}

/**
 * "Agregar a mi lista" (spec: "Adding from the planner writes into the single list"). Resolves
 * the slot's assigned recipe, defaults `targetPortions` to the recipe's own `portions` unless an
 * override is given, then delegates to `generateFromRecipesAction` — the exact same composition
 * path Phase 5's recipe entry points use, so it opens/reuses the household's one active list via
 * `getOrCreateActiveList` rather than creating any planner-owned list state (spec: "there is
 * exactly one active list, and the planner itself holds no checkable item state").
 */
export async function addSlotToListAction(
  day: shoppingApi.PlannerDay,
  mealSlot: shoppingApi.PlannerMealSlot,
  targetPortions?: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const slots = await shoppingApi.listPlannerSlots(supabase, spaceId);
  const slot = slots.find((s) => s.day === day && s.mealSlot === mealSlot);
  if (!slot) return { error: ERROR_COPY.NO_SLOT };

  const recipe = await recipesApi.getRecipeById(supabase, slot.recipeId);
  if (!recipe) return { error: ERROR_COPY.RECIPE_NOT_FOUND };

  const result = await generateFromRecipesAction({
    recipeIds: [slot.recipeId],
    targetPortions: targetPortions ?? recipe.portions,
  });

  revalidatePath("/lista-de-compras");
  return result;
}
