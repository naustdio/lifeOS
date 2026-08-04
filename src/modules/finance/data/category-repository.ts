import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryKind } from "../domain/category";

export type CategoryListItem = {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
};

/**
 * Active (non-archived) categories for the current space (T-037). Excludes
 * deactivated categories from the picker per `finance-categories/Deactivate
 * Categories Instead of Deleting` (picker-exclusion scenario) — read only,
 * writes to `finance.categories` go through ordinary RLS-guarded CRUD
 * (design.md §4.2), not through this repository in this sub-slice.
 */
export async function listActiveCategories(
  supabase: SupabaseClient,
  householdId: string,
  kind?: CategoryKind,
): Promise<CategoryListItem[]> {
  let query = supabase
    .schema("finance")
    .from("categories")
    .select("id, name, kind, parent_id")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    kind: c.kind as CategoryKind,
    parentId: (c.parent_id as string | null) ?? null,
  }));
}
