"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { createProfileFact, toDomainVisibility, updateProfileFact, type WireVisibility } from "@/modules/health/api";
import { createClient } from "@/shared/supabase/server";

export type ProfileFactFormState = {
  error: string | null;
};

const ERROR_COPY = { NOT_A_MEMBER: "No tienes acceso a este espacio." };

/** Profile facts never touch Finance (spec `health-profile`) — no `finance/api` import here. */
export async function createProfileFactAction(
  _prevState: ProfileFactFormState,
  formData: FormData,
): Promise<ProfileFactFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const factType = String(formData.get("factType") ?? "condition") as "blood_type" | "allergy" | "condition";
  const label = String(formData.get("label") ?? "").trim();
  const detail = String(formData.get("detail") ?? "");
  const severity = factType === "allergy" ? (String(formData.get("severity") ?? "low") as "low" | "medium" | "high") : null;
  const visibility = toDomainVisibility(String(formData.get("visibility") ?? "shared") as WireVisibility);

  if (!label) return { error: "Completa la etiqueta." };

  const { error } = await createProfileFact(supabase, {
    householdId: spaceId,
    ownerUserId: user.id,
    factType,
    label,
    detail,
    severity,
    visibility,
  });
  if (error) {
    return {
      error: error.includes("duplicate") || error.includes("23505")
        ? "Ya existe un tipo de sangre registrado — elimínalo primero para cambiarlo."
        : "No se pudo registrar el dato.",
    };
  }

  revalidatePath("/perfil");
  return { error: null };
}

/** "Removing" a fact is `active: false` (spec `health-profile`), not a hard delete — preserves
 *  the "added and later removed" history the spec calls out explicitly. */
export async function deactivateProfileFactAction(
  _prevState: ProfileFactFormState,
  formData: FormData,
): Promise<ProfileFactFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const { error } = await updateProfileFact(supabase, spaceId, id, { active: false });
  if (error) return { error: "No se pudo quitar el dato." };

  revalidatePath("/perfil");
  return { error: null };
}
