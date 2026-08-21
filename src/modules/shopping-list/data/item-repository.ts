import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShoppingListItemRow } from "../domain/combine";

/**
 * Repository for `shopping_list.items` (design.md Schema). Items are stored EXPLODED — one row
 * per contributing origin; combining into display lines happens only in `domain/combine.ts` at
 * read/render time (design.md "Technical Approach"). Plain RLS-guarded direct reads/writes, same
 * shape as `health/data/event-repository.ts` — no ownership restriction on check/remove (spec
 * `shopping-list-continuous` "Add, Check, and Remove Without Ownership Restriction").
 */
export type { ShoppingListItemRow } from "../domain/combine";

export type AddItemInput = {
  name: string;
  quantity: number | null;
  unit: string;
  estimatedUnitCost: number | null;
  storeTypeId: string | null;
  originRecipeId: string | null;
  originRecipeTitle: string | null;
};

const ITEM_COLUMNS =
  "id, list_id, household_id, name, quantity, unit, estimated_unit_cost, store_type_id, is_checked, checked_at, origin_recipe_id, origin_recipe_title, added_by_user_id, created_at";

function mapItemRow(r: Record<string, unknown>): ShoppingListItemRow & {
  listId: string;
  householdId: string;
  storeTypeId: string | null;
  checkedAt: string | null;
  originRecipeId: string | null;
  addedByUserId: string;
} {
  return {
    id: r.id as string,
    listId: r.list_id as string,
    householdId: r.household_id as string,
    name: r.name as string,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unit: r.unit as string,
    estimatedUnitCost: r.estimated_unit_cost === null ? null : Number(r.estimated_unit_cost),
    storeTypeId: (r.store_type_id as string | null) ?? null,
    isChecked: Boolean(r.is_checked),
    checkedAt: (r.checked_at as string | null) ?? null,
    originRecipeId: (r.origin_recipe_id as string | null) ?? null,
    originRecipeTitle: (r.origin_recipe_title as string | null) ?? null,
    addedByUserId: r.added_by_user_id as string,
    createdAt: r.created_at as string,
  };
}

/** Every exploded item row for a list, oldest-first — the raw input `domain/combine.ts`'s
 *  `combineItems` groups into display lines. */
export async function listItems(supabase: SupabaseClient, listId: string) {
  const { data, error } = await supabase
    .schema("shopping_list")
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("list_id", listId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapItemRow);
}

/** Bulk insert — one row per input, never combined at write time. Used both by the loose-item
 *  add form (single input, null origin) and the recipe-generation composition (many inputs, one
 *  per scaled ingredient, in one call). */
export async function addItems(
  supabase: SupabaseClient,
  listId: string,
  householdId: string,
  addedByUserId: string,
  items: readonly AddItemInput[],
): Promise<{ error: string | null }> {
  if (items.length === 0) return { error: null };
  const rows = items.map((item) => ({
    list_id: listId,
    household_id: householdId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    estimated_unit_cost: item.estimatedUnitCost,
    store_type_id: item.storeTypeId,
    origin_recipe_id: item.originRecipeId,
    origin_recipe_title: item.originRecipeTitle,
    added_by_user_id: addedByUserId,
  }));
  const { error } = await supabase.schema("shopping_list").from("items").insert(rows);
  return { error: error?.message ?? null };
}

/** Any household member may check/uncheck any item — no owner-only restriction (spec: "A
 *  different member checks an item added by someone else"). Strikes through IN PLACE — this only
 *  flips `is_checked`/`checked_at`, never moves or reorders the row. */
export async function setChecked(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  isChecked: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("shopping_list")
    .from("items")
    .update({ is_checked: isChecked, checked_at: isChecked ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("household_id", householdId);
  return { error: error?.message ?? null };
}

/** Any household member may remove any item (spec: "Any member can remove an item"). */
export async function removeItem(supabase: SupabaseClient, householdId: string, itemId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("shopping_list").from("items").delete().eq("id", itemId).eq("household_id", householdId);
  return { error: error?.message ?? null };
}
