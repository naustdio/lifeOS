"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { removeBudget, upsertBudgetLimit } from "@/modules/finance/api";
import { pesosToCents } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

export type BudgetFormState = {
  error: string | null;
};

/** Server Action backing the budgets screen's opt-in / limit-edit control (B-005). */
export async function setBudgetLimitAction(
  _prevState: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: "No tienes acceso a este espacio." };

  const categoryId = String(formData.get("categoryId") ?? "");
  const limitCents = pesosToCents(Number(formData.get("limit") ?? 0));

  if (!categoryId || !(limitCents > 0)) {
    return { error: "Ingresa un límite mayor a cero." };
  }

  const { error } = await upsertBudgetLimit(supabase, spaceId, categoryId, limitCents);
  if (error) {
    return { error: "No se pudo guardar el presupuesto." };
  }

  revalidatePath("/presupuestos");
  return { error: null };
}

/** Server Action backing "quitar presupuesto" (B-005) — a real DELETE, per design.md §6 Decision 4. */
export async function removeBudgetAction(
  _prevState: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: "No tienes acceso a este espacio." };

  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) {
    return { error: "Categoría inválida." };
  }

  const { error } = await removeBudget(supabase, spaceId, categoryId);
  if (error) {
    return { error: "No se pudo quitar el presupuesto." };
  }

  revalidatePath("/presupuestos");
  return { error: null };
}
