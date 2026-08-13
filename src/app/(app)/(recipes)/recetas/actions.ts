"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import * as recipesApi from "@/modules/recipes/api";
import { isValidCategory, reasonIsPresent, type IngredientInput, type StepInput } from "@/modules/recipes/api";
import { createClient } from "@/shared/supabase/server";

export type RecipeFormState = {
  error: string | null;
};

const ERROR_COPY: Record<string, string> = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
};

function parseIngredients(formData: FormData): IngredientInput[] {
  try {
    const raw = JSON.parse(String(formData.get("ingredients") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => typeof i?.name === "string" && i.name.trim().length > 0)
      .map((i, position) => ({ position, name: String(i.name), quantity: i.quantity === null || i.quantity === "" ? null : Number(i.quantity), unit: String(i.unit ?? "") }));
  } catch {
    return [];
  }
}

function parseSteps(formData: FormData): StepInput[] {
  try {
    const raw = JSON.parse(String(formData.get("steps") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => typeof s?.instruction === "string" && s.instruction.trim().length > 0)
      .map((s, position) => ({ position, instruction: String(s.instruction) }));
  } catch {
    return [];
  }
}

/** Creates a recipe via the write seam (spec `recipes-catalog` "A Visit Is a Composed Record"-
 *  equivalent for recipes: title/category/portions/video + ingredients + steps all persist from
 *  one submission). Re-validates the reason server-side (defence in depth alongside the DB's
 *  `NOT NULL`/length CHECK — spec `recipes-history` "A direct write bypassing the UI is still
 *  rejected"). */
export async function createRecipeAction(_prevState: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const portions = Number(formData.get("portions") ?? 1);
  const videoUrl = String(formData.get("videoUrl") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!title) return { error: "Completa el título." };
  if (!isValidCategory(category)) return { error: "Selecciona una categoría válida." };
  if (!reasonIsPresent(reason)) return { error: "Escribe un motivo de al menos 3 caracteres." };

  const { id, error } = await recipesApi.createRecipe(supabase, {
    householdId: spaceId,
    title,
    category,
    portions,
    videoUrl,
    ingredients: parseIngredients(formData),
    steps: parseSteps(formData),
    reason,
  });
  if (error || !id) {
    return { error: "No se pudo guardar la receta. " + (error ?? "") };
  }

  revalidatePath("/recetas");
  return { error: null };
}

/** Updates a recipe via the write seam. Same reason re-validation as create. */
export async function updateRecipeAction(_prevState: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const portions = Number(formData.get("portions") ?? 1);
  const videoUrl = String(formData.get("videoUrl") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id) return { error: "Receta no encontrada." };
  if (!title) return { error: "Completa el título." };
  if (!isValidCategory(category)) return { error: "Selecciona una categoría válida." };
  if (!reasonIsPresent(reason)) return { error: "Escribe un motivo de al menos 3 caracteres." };

  const { error } = await recipesApi.updateRecipe(supabase, {
    recipeId: id,
    title,
    category,
    portions,
    videoUrl,
    ingredients: parseIngredients(formData),
    steps: parseSteps(formData),
    reason,
  });
  if (error) {
    return { error: "No se pudo actualizar la receta. " + error };
  }

  revalidatePath("/recetas");
  revalidatePath(`/recetas/${id}`);
  return { error: null };
}

/** Soft-deletes a recipe — any household member, mandatory reason (spec `recipes-history`). */
export async function softDeleteRecipeAction(_prevState: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reasonIsPresent(reason)) return { error: "Escribe un motivo de al menos 3 caracteres." };

  const { error } = await recipesApi.softDeleteRecipe(supabase, id, reason);
  if (error) return { error: "No se pudo eliminar la receta. " + error };

  revalidatePath("/recetas");
  return { error: null };
}

/** Permanently deletes a recipe — owner-only. Checks the caller's role BEFORE attempting the
 *  RPC (design.md Decision 3's defence-in-depth: the action's own check, then the RPC's internal
 *  `core.is_owner` gate, then the RLS DELETE policy if ever bypassed) via the same granted
 *  `core.is_owner` primitive every other owner-gated check in this codebase uses. */
export async function hardDeleteRecipeAction(_prevState: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reasonIsPresent(reason)) return { error: "Escribe un motivo de al menos 3 caracteres." };

  const { data: isOwner, error: roleErr } = await supabase.schema("core").rpc("is_owner", { p_household_id: spaceId });
  if (roleErr || !isOwner) {
    return { error: "Solo quien administra este espacio puede eliminar una receta de forma permanente." };
  }

  const { error } = await recipesApi.hardDeleteRecipe(supabase, id, reason);
  if (error) return { error: "No se pudo eliminar la receta. " + error };

  revalidatePath("/recetas");
  return { error: null };
}
