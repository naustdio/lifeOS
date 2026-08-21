"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import * as recipesApi from "@/modules/recipes/api";
import * as shoppingApi from "@/modules/shopping-list/api";
import { createClient } from "@/shared/supabase/server";

const ERROR_COPY = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
};

/**
 * Server Actions for `/lista-de-compras` — the continuous loose-item list (tasks.md Phase 3).
 * Imports `@/modules/shopping-list/api` ONLY; recipe-origin composition
 * (`generateFromRecipesAction`, importing `@/modules/recipes/api` alongside this module's api,
 * design.md Decision 3) is PR 5's addition, out of scope here.
 */

/** Adds one manual item to the household's active list — always a null recipe origin (spec
 *  `shopping-list-continuous` "Loose Manual Items"). Creates the active list on first use. */
export async function addLooseItemAction(input: {
  name: string;
  quantity: number | null;
  unit: string;
  estimatedUnitCost: number | null;
  storeTypeId: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  if (!input.name.trim() || !input.unit.trim()) return { error: "Completa el nombre y la unidad." };

  const list = await shoppingApi.getOrCreateActiveList(supabase, spaceId);
  if (!list) return { error: "No se pudo abrir la lista de compras." };

  const { error } = await shoppingApi.addItems(supabase, list.id, spaceId, user.id, [
    {
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit.trim(),
      estimatedUnitCost: input.estimatedUnitCost,
      storeTypeId: input.storeTypeId,
      originRecipeId: null,
      originRecipeTitle: null,
    },
  ]);
  if (error) return { error };

  revalidatePath("/lista-de-compras");
  return { error: null };
}

/** Checks/unchecks every item id in a combined line at once (design.md combine algorithm: "check
 *  on a combined line writes `is_checked` to every contributing row") — no ownership restriction
 *  (spec: "A different member checks an item added by someone else"). */
export async function setCheckedAction(itemIds: string[], checked: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const results = await Promise.all(itemIds.map((id) => shoppingApi.setChecked(supabase, spaceId, id, checked)));
  const failed = results.find((r) => r.error);
  if (failed) return { error: failed.error };

  revalidatePath("/lista-de-compras");
  return { error: null };
}

/** Removes every item id in a combined line at once — no ownership restriction (spec: "Any
 *  member can remove an item"). */
export async function removeItemAction(itemIds: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const results = await Promise.all(itemIds.map((id) => shoppingApi.removeItem(supabase, spaceId, id)));
  const failed = results.find((r) => r.error);
  if (failed) return { error: failed.error };

  revalidatePath("/lista-de-compras");
  return { error: null };
}

/** "Finalizar compra" (spec `shopping-list-continuous` "Explicit Clear via 'Finalizar
 *  compra'") — the ONLY way the list clears. Closes the current active list; the next page load
 *  lazily gets a brand-new empty one via `getOrCreateActiveList`. */
export async function finalizeAction(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const list = await shoppingApi.getOrCreateActiveList(supabase, spaceId);
  if (!list) return { error: "No se pudo abrir la lista de compras." };

  const { error } = await shoppingApi.finalizePurchase(supabase, spaceId, list.id, user.id);
  if (error) return { error };

  revalidatePath("/lista-de-compras");
  return { error: null };
}

/** Creates a household-scoped custom store type (Phase 4, spec `shopping-list-store-types` "A
 *  member creates a custom store type"). `shoppingApi.createStoreType` only returns `{error}` (no
 *  id), so this re-reads `listStoreTypes` afterward to resolve the created row by name — matching
 *  by lowercased name since `store_types`' uniqueness is itself case-insensitive. */
export async function createStoreTypeAction(
  name: string,
): Promise<{ storeType: { id: string; name: string } | null; error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { storeType: null, error: ERROR_COPY.NOT_A_MEMBER };

  const trimmed = name.trim();
  if (!trimmed) return { storeType: null, error: "Escribe un nombre para la tienda." };

  const { error } = await shoppingApi.createStoreType(supabase, spaceId, trimmed);
  if (error) return { storeType: null, error };

  const types = await shoppingApi.listStoreTypes(supabase, spaceId);
  const created = types.find((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase());

  revalidatePath("/lista-de-compras");
  return { storeType: created ? { id: created.id, name: created.name } : null, error: null };
}

/**
 * Recipe entry points (Phase 5, design.md Decision 3) — the ONLY file in this change allowed to
 * import `@/modules/recipes/api` and `@/modules/shopping-list/api` side by side, and it lives at
 * the app layer, not inside `src/modules/shopping-list` (spec `shopping-list-module-api` "App-
 * Layer Composition for Cross-Module Data"). Scales each ingredient by
 * `targetPortions / recipe.portions` — verbatim from `RecipeDetail.tsx:206` — resolves a store
 * type per ingredient (item has none yet, so only the household's learned default applies), and
 * passes a plain `AddItemInput[]` into `shoppingApi.addItems`, never a live recipes object.
 */
export async function generateFromRecipesAction(input: {
  recipeIds: string[];
  targetPortions: number;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  if (input.recipeIds.length === 0) return { error: null };

  const recipes = await Promise.all(input.recipeIds.map((id) => recipesApi.getRecipeById(supabase, id)));
  const validRecipes = recipes.filter((r): r is NonNullable<typeof r> => r !== null);
  if (validRecipes.length === 0) return { error: "No se encontraron las recetas seleccionadas." };

  const allIngredientNames = validRecipes.flatMap((r) => r.ingredients.map((i) => i.name));
  const defaults = await shoppingApi.getIngredientDefaults(supabase, spaceId, allIngredientNames);

  const items: shoppingApi.AddItemInput[] = validRecipes.flatMap((recipe) =>
    recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: shoppingApi.scaleQuantity(ingredient.quantity, input.targetPortions, recipe.portions),
      unit: ingredient.unit,
      estimatedUnitCost: ingredient.estimatedUnitCost,
      storeTypeId: defaults.get(ingredient.name.trim().toLowerCase()) ?? null,
      originRecipeId: recipe.id,
      originRecipeTitle: recipe.title,
    })),
  );

  const list = await shoppingApi.getOrCreateActiveList(supabase, spaceId);
  if (!list) return { error: "No se pudo abrir la lista de compras." };

  const { error } = await shoppingApi.addItems(supabase, list.id, spaceId, user.id, items);
  if (error) return { error };

  revalidatePath("/lista-de-compras");
  return { error: null };
}
