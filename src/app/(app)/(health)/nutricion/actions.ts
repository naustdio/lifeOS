"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import * as healthApi from "@/modules/health/api";
import { toDomainVisibility, type VitalMetric, VITAL_METRICS, type WireVisibility } from "@/modules/health/api";
import { findByOrigin, recordTransaction, voidTransactionById } from "@/modules/finance/api";
import { pesosToCents } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

export type NutritionVisitFormState = {
  error: string | null;
};

const ERROR_COPY: Record<string, string> = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
};

const PHOTO_MAX_COUNT = 6;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type EventLookup = (
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  id: string,
) => Promise<{ id: string; eventType: string } | null>;

/**
 * The single choke point deciding whether an `event_id` may be used to link a vital reading or
 * photo (design.md Decision 2 — app-layer validation only, no DB trigger, because `/nutricion` is
 * the sole path that ever creates that link). `getEventById` is injectable for unit testing
 * without a real Supabase client (tasks.md 4.1 RED test).
 */
export async function assertNutritionEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  eventId: string,
  getEventById: EventLookup = healthApi.getEventById,
): Promise<{ ok: true; event: { id: string; eventType: string } } | { ok: false; error: string }> {
  const event = await getEventById(supabase, householdId, eventId);
  if (!event) {
    return { ok: false, error: "No se encontró la visita." };
  }
  if (event.eventType !== "nutrition") {
    return { ok: false, error: "Ese evento no es una visita de nutrición." };
  }
  return { ok: true, event };
}

function parseMetricEntries(formData: FormData): { metric: VitalMetric; valueNumeric: number }[] {
  const entries: { metric: VitalMetric; valueNumeric: number }[] = [];
  for (const metric of VITAL_METRICS) {
    const raw = formData.get(`metric_${metric}`);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) {
      entries.push({ metric, valueNumeric: value });
    }
  }
  return entries;
}

/** Validates every photo BEFORE any is stored (spec `health-nutrition-visits` "Photo Attachment
 *  Limits" — a submission exceeding the count/type/size limits is rejected wholesale). */
function validatePhotoFiles(files: File[], existingCount: number): string | null {
  if (files.length === 0) return null;
  if (existingCount + files.length > PHOTO_MAX_COUNT) {
    return `Máximo ${PHOTO_MAX_COUNT} fotos por visita.`;
  }
  for (const file of files) {
    if (!(file.type in PHOTO_ALLOWED_TYPES)) {
      return "Las fotos deben ser JPG, PNG o WebP.";
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return "Cada foto debe pesar menos de 10MB.";
    }
  }
  return null;
}

async function persistPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { householdId: string; eventId: string; ownerUserId: string; files: File[] },
): Promise<string | null> {
  for (const file of input.files) {
    const ext = PHOTO_ALLOWED_TYPES[file.type];
    const { error } = await healthApi.insertPhoto(supabase, {
      householdId: input.householdId,
      eventId: input.eventId,
      ownerUserId: input.ownerUserId,
      file,
      ext,
    });
    if (error) return "No se pudieron guardar todas las fotos.";
  }
  return null;
}

/**
 * Creates a nutrition visit: the event (mirroring `salud/actions.ts`'s `createHealthEventAction`
 * Finance seam byte-for-byte, hard-coded to `eventType: "nutrition"`), then its first metrics and
 * photos (spec `health-nutrition-visits` "A Visit Is a Composed Record" — "saved together from a
 * single `/nutricion` submission", and "may be saved with metrics only or photos only").
 */
export async function createNutritionVisitAction(
  _prevState: NutritionVisitFormState,
  formData: FormData,
): Promise<NutritionVisitFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const title = String(formData.get("title") ?? "").trim();
  const occurredOn = String(formData.get("occurredOn") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const visibility = toDomainVisibility(String(formData.get("visibility") ?? "shared") as WireVisibility);
  const providerName = String(formData.get("providerName") ?? "") || null;

  if (!title || !occurredOn) {
    return { error: "Completa el título y la fecha." };
  }

  const hasCost = formData.get("hasCost") === "on";
  const accountId = hasCost ? String(formData.get("accountId") ?? "") : "";
  const categoryId = hasCost ? String(formData.get("categoryId") ?? "") : "";
  const amountCents = hasCost ? pesosToCents(Number(formData.get("amount") ?? 0)) : null;
  if (hasCost && (!accountId || !categoryId || !(amountCents! > 0))) {
    return { error: "Completa cuenta, categoría y monto del costo." };
  }

  const photoFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photoError = validatePhotoFiles(photoFiles, 0);
  if (photoError) return { error: photoError };

  const clientEventId = String(formData.get("clientEventId") ?? "") || undefined;

  const { id: eventId, error: createErr } = await healthApi.createEvent(supabase, {
    id: clientEventId,
    householdId: spaceId,
    ownerUserId: user.id,
    eventType: "nutrition",
    title,
    occurredOn,
    notes,
    visibility,
    amountCents: hasCost ? amountCents : null,
    accountId: hasCost ? accountId : null,
    categoryId: hasCost ? categoryId : null,
    providerName,
  });
  if (createErr || !eventId) {
    return { error: "No se pudo registrar la visita. " + (createErr ?? "") };
  }

  if (hasCost) {
    const result = await recordTransaction({
      householdId: spaceId,
      accountId,
      categoryId,
      kind: "expense",
      amountCents: amountCents!,
      occurredOn,
      description: title,
      origin: { module: "health", entityId: eventId },
      idempotencyKey: eventId,
    });
    if (!result.ok) {
      return { error: ERROR_COPY[result.error.code] ?? "La visita se guardó, pero no se pudo registrar el gasto." };
    }
  }

  for (const entry of parseMetricEntries(formData)) {
    await healthApi.createVitalReading(supabase, {
      householdId: spaceId,
      ownerUserId: user.id,
      metric: entry.metric,
      valueNumeric: entry.valueNumeric,
      measuredAt: new Date(occurredOn).toISOString(),
      visibility,
      eventId,
    });
  }

  const photoPersistErr = await persistPhotos(supabase, { householdId: spaceId, eventId, ownerUserId: user.id, files: photoFiles });
  if (photoPersistErr) return { error: photoPersistErr };

  revalidatePath("/nutricion");
  revalidatePath("/signos");
  revalidatePath("/finance");
  revalidatePath("/movimientos");
  return { error: null };
}

/** Adds metric readings to an already-saved visit (spec `health-nutrition-visits` "A Visit Is
 *  Editable After Creation"). */
export async function addVisitMetricsAction(
  _prevState: NutritionVisitFormState,
  formData: FormData,
): Promise<NutritionVisitFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const eventId = String(formData.get("eventId") ?? "");
  const assertion = await assertNutritionEvent(supabase, spaceId, eventId);
  if (!assertion.ok) return { error: assertion.error };

  const measuredOn = String(formData.get("measuredOn") ?? "") || new Date().toISOString().slice(0, 10);
  const entries = parseMetricEntries(formData);
  if (entries.length === 0) return { error: "Agrega al menos una métrica." };

  for (const entry of entries) {
    await healthApi.createVitalReading(supabase, {
      householdId: spaceId,
      ownerUserId: user.id,
      metric: entry.metric,
      valueNumeric: entry.valueNumeric,
      measuredAt: new Date(measuredOn).toISOString(),
      eventId,
    });
  }

  revalidatePath(`/nutricion/${eventId}`);
  revalidatePath("/signos");
  return { error: null };
}

/** Adds photos to an already-saved visit (spec `health-nutrition-visits` "A Visit Is Editable
 *  After Creation" / "Photo Attachment Limits" — the cap counts existing + new). */
export async function addVisitPhotosAction(
  _prevState: NutritionVisitFormState,
  formData: FormData,
): Promise<NutritionVisitFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const eventId = String(formData.get("eventId") ?? "");
  const assertion = await assertNutritionEvent(supabase, spaceId, eventId);
  if (!assertion.ok) return { error: assertion.error };

  const existing = await healthApi.listVisitPhotos(supabase, eventId);
  const photoFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photoError = validatePhotoFiles(photoFiles, existing.length);
  if (photoError) return { error: photoError };

  const photoPersistErr = await persistPhotos(supabase, { householdId: spaceId, eventId, ownerUserId: user.id, files: photoFiles });
  if (photoPersistErr) return { error: photoPersistErr };

  revalidatePath(`/nutricion/${eventId}`);
  return { error: null };
}

/** Removes the Storage object BEFORE the row (design.md Decision 4). */
export async function deleteVisitPhotoAction(
  _prevState: NutritionVisitFormState,
  formData: FormData,
): Promise<NutritionVisitFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const storagePath = String(formData.get("storagePath") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  const { error } = await healthApi.deletePhoto(supabase, id, storagePath);
  if (error) return { error: "No se pudo eliminar la foto." };

  revalidatePath(`/nutricion/${eventId}`);
  return { error: null };
}

/**
 * Deletes a nutrition visit (spec `health-events` "Deleting a nutrition visit unlinks its
 * readings instead of deleting them" / "...deletes its photos"). Order matters (design.md
 * Decision 4): Storage objects removed first (a failure here aborts with rows intact — a
 * recoverable pointer), then the event row itself, whose FKs `on delete set null`
 * (`vital_readings.event_id`) and `on delete cascade` (`nutrition_visit_photos`) do the rest at
 * the DB layer. The linked Finance transaction is voided, never deleted (spec `health-events`
 * "Deleting an event voids its transaction").
 */
export async function deleteNutritionVisitAction(
  _prevState: NutritionVisitFormState,
  formData: FormData,
): Promise<NutritionVisitFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const event = await healthApi.getEventById(supabase, spaceId, id);

  if (event && event.amountCents !== null && !event.recurringTransactionId) {
    const found = await findByOrigin({ householdId: spaceId, module: "health", entityId: id });
    if (found.ok && found.value) {
      await voidTransactionById(found.value.id, "Visita de nutrición eliminada");
    }
  }

  const photos = await healthApi.listVisitPhotos(supabase, id);
  if (photos.length > 0) {
    const removeErr = await healthApi.removeObjects(
      supabase,
      photos.map((p) => p.storagePath),
    );
    if (removeErr.error) return { error: "No se pudieron eliminar las fotos de la visita." };
  }

  const { error } = await healthApi.deleteEvent(supabase, spaceId, id);
  if (error) return { error: "No se pudo eliminar la visita." };

  revalidatePath("/nutricion");
  revalidatePath("/signos");
  revalidatePath("/finance");
  revalidatePath("/movimientos");
  return { error: null };
}
