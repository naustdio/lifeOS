import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for `health.nutrition_visit_photos` + the private `health-nutrition-photos` Storage
 * bucket (migration `20260811090037_health_nutrition_visits.sql`, design.md Decision 1). Photos
 * are owner-only regardless of the linked visit's `visibility` — deliberately NOT the
 * household-or-owner shape `vital-repository.ts`/`event-repository.ts` use. Signed URLs are
 * minted here only, server-side; the bucket is never public.
 */
export const NUTRITION_PHOTO_BUCKET = "health-nutrition-photos";

/** Object path convention enforced by the storage policies: `{ownerUserId}/{eventId}/{uuid}.{ext}`. */
export function buildPhotoPath(ownerUserId: string, eventId: string, ext: string): string {
  return `${ownerUserId}/${eventId}/${crypto.randomUUID()}.${ext}`;
}

export type NutritionVisitPhoto = {
  id: string;
  householdId: string;
  eventId: string;
  ownerUserId: string;
  storagePath: string;
  createdAt: string;
};

function mapPhotoRow(r: Record<string, unknown>): NutritionVisitPhoto {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    eventId: r.event_id as string,
    ownerUserId: r.owner_user_id as string,
    storagePath: r.storage_path as string,
    createdAt: r.created_at as string,
  };
}

const PHOTO_COLUMNS = "id, household_id, event_id, owner_user_id, storage_path, created_at";

/** RLS-guarded — only rows the caller owns are ever returned. */
export async function listVisitPhotos(supabase: SupabaseClient, eventId: string): Promise<NutritionVisitPhoto[]> {
  const { data, error } = await supabase
    .schema("health")
    .from("nutrition_visit_photos")
    .select(PHOTO_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map(mapPhotoRow);
}

/** Uploads the file to the private bucket, then inserts the row pointing at it. */
export async function insertPhoto(
  supabase: SupabaseClient,
  input: { householdId: string; eventId: string; ownerUserId: string; file: File; ext: string },
): Promise<{ id: string | null; error: string | null }> {
  const storagePath = buildPhotoPath(input.ownerUserId, input.eventId, input.ext);

  const upload = await supabase.storage.from(NUTRITION_PHOTO_BUCKET).upload(storagePath, input.file, { upsert: false });
  if (upload.error) {
    return { id: null, error: upload.error.message };
  }

  const { data, error } = await supabase
    .schema("health")
    .from("nutrition_visit_photos")
    .insert({
      household_id: input.householdId,
      event_id: input.eventId,
      owner_user_id: input.ownerUserId,
      storage_path: storagePath,
    })
    .select("id")
    .single();

  if (error || !data) {
    await supabase.storage.from(NUTRITION_PHOTO_BUCKET).remove([storagePath]);
    return { id: null, error: error?.message ?? "insert failed" };
  }

  return { id: data.id as string, error: null };
}

/** Removes the Storage object BEFORE the row, per design.md Decision 4 — a storage failure aborts
 *  with the row intact (a recoverable pointer), never rows-gone-bytes-orphaned. */
export async function deletePhoto(supabase: SupabaseClient, id: string, storagePath: string): Promise<{ error: string | null }> {
  const removed = await supabase.storage.from(NUTRITION_PHOTO_BUCKET).remove([storagePath]);
  if (removed.error) {
    return { error: removed.error.message };
  }

  const { error } = await supabase.schema("health").from("nutrition_visit_photos").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/** Bulk object removal used when a visit's event is deleted (DB cascade handles the rows). */
export async function removeObjects(supabase: SupabaseClient, storagePaths: string[]): Promise<{ error: string | null }> {
  if (storagePaths.length === 0) {
    return { error: null };
  }
  const { error } = await supabase.storage.from(NUTRITION_PHOTO_BUCKET).remove(storagePaths);
  return { error: error?.message ?? null };
}

/** Server-side only signed URL, short-lived (design.md Data Flow). */
export async function createPhotoSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(NUTRITION_PHOTO_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}
