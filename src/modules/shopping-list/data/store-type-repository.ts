import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for `shopping_list.store_types` + `shopping_list.ingredient_store_defaults`
 * (design.md Decision 1 / Decision 4). Open, household-scoped taxonomy — never a fixed enum
 * (spec `shopping-list-store-types` "Open, Household-Scoped Store-Type Taxonomy"). Resolution
 * order (item override → household default → null "Sin categoría") is applied by the caller;
 * this repository only stores and reads the two independent layers.
 */
export type StoreType = { id: string; householdId: string; name: string; createdAt: string };

/** Base set every household must have available without manual creation (design.md Decision 4,
 *  spec `shopping-list-store-types` "Base Store-Type Set"). Seeded rows, not a domain constant —
 *  the item row's `store_type_id` is a real FK and a constant can't be an FK target. */
export const BASE_STORE_TYPES = ["Supermercado", "Carnicería", "Cremería", "Mercado y Frutas y Verduras"] as const;

function mapStoreTypeRow(r: Record<string, unknown>): StoreType {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    name: r.name as string,
    createdAt: r.created_at as string,
  };
}

/** All store types for a household — base + any custom ones, no distinction in shape. */
export async function listStoreTypes(supabase: SupabaseClient, householdId: string): Promise<StoreType[]> {
  const { data, error } = await supabase
    .schema("shopping_list")
    .from("store_types")
    .select("id, household_id, name, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapStoreTypeRow);
}

/** Idempotently seeds `BASE_STORE_TYPES` for a household — safe to call on every page load.
 *  `store_types`' uniqueness is an EXPRESSION index (`household_id, lower(name)`), which
 *  PostgREST's `on_conflict` parameter cannot target directly (it only accepts plain column
 *  names), so idempotency is done by reading existing lowercased names first and inserting only
 *  the missing ones, rather than relying on `on conflict do nothing`. */
export async function ensureBaseStoreTypes(supabase: SupabaseClient, householdId: string): Promise<{ error: string | null }> {
  const { data: existing, error: readErr } = await supabase
    .schema("shopping_list")
    .from("store_types")
    .select("name")
    .eq("household_id", householdId);
  if (readErr) return { error: readErr.message };

  const existingLower = new Set((existing ?? []).map((r) => (r.name as string).trim().toLowerCase()));
  const missing = BASE_STORE_TYPES.filter((name) => !existingLower.has(name.toLowerCase()));
  if (missing.length === 0) return { error: null };

  const { error } = await supabase
    .schema("shopping_list")
    .from("store_types")
    .insert(missing.map((name) => ({ household_id: householdId, name })));
  return { error: error?.message ?? null };
}

/** A member creates a custom store type (spec: "A member creates a custom store type
 *  ('Panadería') and it becomes selectable"). */
export async function createStoreType(supabase: SupabaseClient, householdId: string, name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("shopping_list").from("store_types").insert({ household_id: householdId, name });
  return { error: error?.message ?? null };
}

/** Household-learned default store type per lowercased ingredient name — works identically for
 *  recipe-origin and loose items since it keys by name text, not a catalog FK (design.md
 *  Decision 1). Returns a `Map` keyed by the SAME lowercased form callers pass in. */
export async function getIngredientDefaults(
  supabase: SupabaseClient,
  householdId: string,
  ingredientNames: readonly string[],
): Promise<Map<string, string>> {
  const lowered = [...new Set(ingredientNames.map((n) => n.trim().toLowerCase()))].filter((n) => n.length > 0);
  if (lowered.length === 0) return new Map();

  const { data, error } = await supabase
    .schema("shopping_list")
    .from("ingredient_store_defaults")
    .select("ingredient_name, store_type_id")
    .eq("household_id", householdId)
    .in("ingredient_name", lowered);
  if (error || !data) return new Map();

  const map = new Map<string, string>();
  for (const row of data) {
    map.set(row.ingredient_name as string, row.store_type_id as string);
  }
  return map;
}

/** Sets/overwrites the household's learned default store type for one ingredient name — the
 *  repo lowercases the name before writing, matching `getIngredientDefaults`' lookup key. */
export async function setIngredientDefault(
  supabase: SupabaseClient,
  householdId: string,
  ingredientName: string,
  storeTypeId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("shopping_list")
    .from("ingredient_store_defaults")
    .upsert(
      { household_id: householdId, ingredient_name: ingredientName.trim().toLowerCase(), store_type_id: storeTypeId },
      { onConflict: "household_id,ingredient_name" },
    );
  return { error: error?.message ?? null };
}
