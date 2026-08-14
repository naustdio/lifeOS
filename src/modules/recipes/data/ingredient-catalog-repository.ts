import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for `recipes.ingredient_catalog` + the private `recipes-ingredient-photos` Storage
 * bucket (migration `20260814140000_recipes_ingredient_catalog.sql`). Unlike `recipe-repository`'s
 * write functions, this table is NOT seam-only — a household member may insert/update a row
 * directly under RLS (no mandatory-reason audit needed for a lightweight reference entry); the
 * write seam (`create_recipe`/`update_recipe`) separately auto-catalogs every ingredient name
 * used, bare (no photo/icon), so the list keeps growing even for members who never attach a photo.
 */
export const INGREDIENT_PHOTO_BUCKET = "recipes-ingredient-photos";

/** Object path convention enforced by the storage policies: `{householdId}/{uuid}.{ext}`. */
export function buildIngredientPhotoPath(householdId: string, ext: string): string {
  return `${householdId}/${crypto.randomUUID()}.${ext}`;
}

export type IngredientCatalogEntry = {
  id: string;
  householdId: string;
  name: string;
  photoPath: string | null;
  icon: string | null;
};

function mapCatalogRow(r: Record<string, unknown>): IngredientCatalogEntry {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    name: r.name as string,
    photoPath: (r.photo_path as string | null) ?? null,
    icon: (r.icon as string | null) ?? null,
  };
}

const CATALOG_COLUMNS = "id, household_id, name, photo_path, icon";

/** RLS-guarded — every entry the caller's household has gathered so far, for autocomplete. */
export async function listIngredientCatalog(supabase: SupabaseClient, householdId: string): Promise<IngredientCatalogEntry[]> {
  const { data, error } = await supabase
    .schema("recipes")
    .from("ingredient_catalog")
    .select(CATALOG_COLUMNS)
    .eq("household_id", householdId)
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data.map(mapCatalogRow);
}

/** Batch-resolves short-lived signed URLs for every given photo path in one call. Server-side
 *  only — the bucket is never public. Missing/failed entries are simply absent from the map. */
export async function signIngredientPhotoUrls(
  supabase: SupabaseClient,
  photoPaths: string[],
  expiresInSeconds = 300,
): Promise<Record<string, string>> {
  if (photoPaths.length === 0) return {};

  const { data, error } = await supabase.storage.from(INGREDIENT_PHOTO_BUCKET).createSignedUrls(photoPaths, expiresInSeconds);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

/** Upserts a catalog entry by (household, case-insensitive name) — creates it if the seam hasn't
 *  yet (e.g. attaching a photo/icon before ever saving a recipe with this ingredient), or fills in
 *  whichever of photo/icon is provided on an existing bare entry. Never blanks an already-set
 *  photo/icon by passing the other as null — pass only the one being set. */
export async function upsertIngredientCatalogEntry(
  supabase: SupabaseClient,
  input: { householdId: string; name: string; photoPath?: string; icon?: string },
): Promise<{ id: string | null; error: string | null }> {
  const name = input.name.trim();
  if (!name) return { id: null, error: "name is required" };

  const { data: existing } = await supabase
    .schema("recipes")
    .from("ingredient_catalog")
    .select("id")
    .eq("household_id", input.householdId)
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, string> = {};
    if (input.photoPath) patch.photo_path = input.photoPath;
    if (input.icon) patch.icon = input.icon;
    const { error } = await supabase.schema("recipes").from("ingredient_catalog").update(patch).eq("id", existing.id as string);
    return { id: existing.id as string, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .schema("recipes")
    .from("ingredient_catalog")
    .insert({ household_id: input.householdId, name, photo_path: input.photoPath ?? null, icon: input.icon ?? null })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "insert failed" };
  }
  return { id: data.id as string, error: null };
}

/** Uploads the file to the private bucket, then attaches it to the named catalog entry. */
export async function uploadIngredientPhoto(
  supabase: SupabaseClient,
  input: { householdId: string; name: string; file: File; ext: string },
): Promise<{ photoPath: string | null; error: string | null }> {
  const storagePath = buildIngredientPhotoPath(input.householdId, input.ext);

  const upload = await supabase.storage.from(INGREDIENT_PHOTO_BUCKET).upload(storagePath, input.file, { upsert: false });
  if (upload.error) {
    return { photoPath: null, error: upload.error.message };
  }

  const { error } = await upsertIngredientCatalogEntry(supabase, { householdId: input.householdId, name: input.name, photoPath: storagePath });
  if (error) {
    await supabase.storage.from(INGREDIENT_PHOTO_BUCKET).remove([storagePath]);
    return { photoPath: null, error };
  }

  return { photoPath: storagePath, error: null };
}
