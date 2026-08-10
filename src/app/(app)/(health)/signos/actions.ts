"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { createVitalReading, deleteVitalReading, toDomainVisibility, type WireVisibility } from "@/modules/health/api";
import { createClient } from "@/shared/supabase/server";

export type VitalFormState = {
  error: string | null;
};

const ERROR_COPY = { NOT_A_MEMBER: "No tienes acceso a este espacio." };

/** Vital readings never touch Finance (spec `health-vitals`) — no `finance/api` import here at
 *  all, structurally, not merely by convention. */
export async function createVitalReadingAction(
  _prevState: VitalFormState,
  formData: FormData,
): Promise<VitalFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const metric = String(formData.get("metric") ?? "weight_kg") as
    | "weight_kg"
    | "systolic_bp"
    | "diastolic_bp"
    | "glucose_mgdl"
    | "heart_rate";
  const valueNumeric = Number(formData.get("valueNumeric") ?? 0);
  const measuredOn = String(formData.get("measuredOn") ?? "");
  const visibility = toDomainVisibility(String(formData.get("visibility") ?? "shared") as WireVisibility);

  if (!(valueNumeric > 0) || !measuredOn) {
    return { error: "Completa el valor y la fecha." };
  }

  const { error } = await createVitalReading(supabase, {
    householdId: spaceId,
    ownerUserId: user.id,
    metric,
    valueNumeric,
    measuredAt: new Date(measuredOn).toISOString(),
    visibility,
  });
  if (error) return { error: "No se pudo registrar la métrica." };

  revalidatePath("/signos");
  return { error: null };
}

export async function deleteVitalReadingAction(
  _prevState: VitalFormState,
  formData: FormData,
): Promise<VitalFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const { error } = await deleteVitalReading(supabase, spaceId, id);
  if (error) return { error: "No se pudo eliminar el registro." };

  revalidatePath("/signos");
  return { error: null };
}
