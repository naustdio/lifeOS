import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for `recipes.custom_units` — free-text units persisted per-household by the seam
 * functions (design.md Decision 4). Read-only here; writes happen only inside
 * `create_recipe`/`update_recipe` via `on conflict do nothing` upserts.
 */
export async function listCustomUnits(supabase: SupabaseClient, householdId: string): Promise<string[]> {
  const { data, error } = await supabase.schema("recipes").from("custom_units").select("unit_name").eq("household_id", householdId).order("unit_name");

  if (error || !data) {
    return [];
  }
  return data.map((r) => r.unit_name as string);
}
