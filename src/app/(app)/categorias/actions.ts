"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { archiveCategory, createCategory, updateCategory } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";

export type CategoryFormState = {
  error: string | null;
};

/** Server Action backing "Nueva categoría" (C-018). Icon/color are optional — an empty
 *  hidden field arrives as `""`, normalized to `null` before it reaches the repository. */
export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const supabase = await createClient();
  const householdId = await getCurrentHouseholdId(supabase);
  if (!householdId) return { error: "No tienes acceso a este espacio." };

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const parentId = String(formData.get("parentId") ?? "") || null;
  const icon = String(formData.get("icon") ?? "") || null;
  const color = String(formData.get("color") ?? "") || null;

  if (!name || (kind !== "income" && kind !== "expense")) {
    return { error: "Nombre y tipo son obligatorios." };
  }

  const { error } = await createCategory(supabase, householdId, {
    name,
    kind,
    parentId,
    icon,
    color,
  });
  if (error) {
    return { error: "No se pudo crear la categoría." };
  }

  revalidatePath("/categorias");
  return { error: null };
}

/** Server Action backing the restyle/rename flow (C-018). Never accepts `kind`/`parentId` —
 *  reparenting and kind changes are explicit non-goals (design.md §4, §6 Decision 7). */
export async function updateCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const supabase = await createClient();
  const householdId = await getCurrentHouseholdId(supabase);
  if (!householdId) return { error: "No tienes acceso a este espacio." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const icon = String(formData.get("icon") ?? "") || null;
  const color = String(formData.get("color") ?? "") || null;

  if (!id || !name) {
    return { error: "Categoría inválida." };
  }

  const { error } = await updateCategory(supabase, householdId, id, { name, icon, color });
  if (error) {
    return { error: "No se pudo actualizar la categoría." };
  }

  revalidatePath("/categorias");
  return { error: null };
}

/** Server Action backing "Desactivar" (C-018). Archive only — there is no DELETE policy or
 *  grant on `finance.categories`. */
export async function archiveCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const supabase = await createClient();
  const householdId = await getCurrentHouseholdId(supabase);
  if (!householdId) return { error: "No tienes acceso a este espacio." };

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "Categoría inválida." };
  }

  const { error } = await archiveCategory(supabase, householdId, id);
  if (error) {
    return { error: "No se pudo desactivar la categoría." };
  }

  revalidatePath("/categorias");
  return { error: null };
}
