import type { SupabaseClient } from "@supabase/supabase-js";
import { setRecipePhoto } from "./recipe-repository";

/**
 * Storage helper for a recipe's own photo (private `recipes-photos` bucket, migration
 * `20260814150000_recipes_photo_and_duration.sql`) — distinct from `ingredient-catalog-
 * repository.ts`'s per-ingredient photos. Mirrors `nutrition-photo-repository.ts`'s upload shape:
 * the file goes up first, the row is pointed at it second, and a failed row-write rolls the
 * object back out rather than leaving an orphaned upload.
 */
export const RECIPE_PHOTO_BUCKET = "recipes-photos";

/** Object path convention enforced by the storage policies: `{householdId}/{uuid}.{ext}`. */
export function buildRecipePhotoPath(householdId: string, ext: string): string {
  return `${householdId}/${crypto.randomUUID()}.${ext}`;
}

export async function uploadRecipePhoto(
  supabase: SupabaseClient,
  input: { householdId: string; recipeId: string; file: File; ext: string },
): Promise<{ photoPath: string | null; error: string | null }> {
  const storagePath = buildRecipePhotoPath(input.householdId, input.ext);

  const upload = await supabase.storage.from(RECIPE_PHOTO_BUCKET).upload(storagePath, input.file, { upsert: false });
  if (upload.error) {
    return { photoPath: null, error: upload.error.message };
  }

  const { error } = await setRecipePhoto(supabase, input.recipeId, storagePath);
  if (error) {
    await supabase.storage.from(RECIPE_PHOTO_BUCKET).remove([storagePath]);
    return { photoPath: null, error };
  }

  return { photoPath: storagePath, error: null };
}

/** Batch-resolves short-lived signed URLs, matching `signIngredientPhotoUrls`'s shape. */
export async function signRecipePhotoUrls(
  supabase: SupabaseClient,
  photoPaths: string[],
  expiresInSeconds = 300,
): Promise<Record<string, string>> {
  if (photoPaths.length === 0) return {};

  const { data, error } = await supabase.storage.from(RECIPE_PHOTO_BUCKET).createSignedUrls(photoPaths, expiresInSeconds);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}
