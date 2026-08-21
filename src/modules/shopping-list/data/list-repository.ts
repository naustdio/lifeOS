import type { SupabaseClient } from "@supabase/supabase-js";
import { estimatedTotal } from "../domain/scale";

/**
 * Repository for `shopping_list.lists` (design.md Schema, migration
 * `20260818090000_shopping_list_schema.sql` / `..._security.sql`). Plain RLS-guarded direct
 * reads/writes — no security-definer seam (design.md: "DIRECT-RLS writes... no
 * security-definer seam, since no mandatory-reason audit exists"), same shape as
 * `health/data/event-repository.ts`.
 */
export type ShoppingList = {
  id: string;
  householdId: string;
  status: "active" | "closed";
  estimatedTotal: number | null;
  closedAt: string | null;
  closedByUserId: string | null;
  createdAt: string;
};

const LIST_COLUMNS = "id, household_id, status, estimated_total, closed_at, closed_by_user_id, created_at";

function mapListRow(r: Record<string, unknown>): ShoppingList {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    status: r.status as "active" | "closed",
    estimatedTotal: r.estimated_total === null || r.estimated_total === undefined ? null : Number(r.estimated_total),
    closedAt: (r.closed_at as string | null) ?? null,
    closedByUserId: (r.closed_by_user_id as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** The household's single active list (design.md Decision 5, spec `shopping-list-continuous`
 *  "Single Continuous List Per Household") — creates one on first read, reuses it on every
 *  subsequent read. The partial unique index on `(household_id) where status = 'active'`
 *  guarantees at most one active list ever exists. Returns null only on an unexpected DB error. */
export async function getOrCreateActiveList(supabase: SupabaseClient, householdId: string): Promise<ShoppingList | null> {
  const existing = await supabase
    .schema("shopping_list")
    .from("lists")
    .select(LIST_COLUMNS)
    .eq("household_id", householdId)
    .eq("status", "active")
    .maybeSingle();
  if (existing.data) return mapListRow(existing.data);
  if (existing.error) return null;

  const created = await supabase
    .schema("shopping_list")
    .from("lists")
    .insert({ household_id: householdId })
    .select(LIST_COLUMNS)
    .single();
  if (created.error || !created.data) return null;
  return mapListRow(created.data);
}

/** Explicit "Finalizar compra" (spec `shopping-list-continuous` "Explicit Clear via 'Finalizar
 *  compra'"): closes the given list, stamps `estimated_total` from its own items
 *  (`domain/scale.ts`'s `estimatedTotal`), and stamps who closed it. The next call to
 *  `getOrCreateActiveList` lazily creates a brand-new empty active list — this function itself
 *  never creates one, keeping "close" and "create the next" as two separate, composable steps. */
export async function finalizePurchase(
  supabase: SupabaseClient,
  householdId: string,
  listId: string,
  closedByUserId: string,
): Promise<{ error: string | null }> {
  const { data: itemRows, error: itemsErr } = await supabase
    .schema("shopping_list")
    .from("items")
    .select("quantity, estimated_unit_cost")
    .eq("list_id", listId);
  if (itemsErr) return { error: itemsErr.message };

  const total = estimatedTotal(
    (itemRows ?? []).map((r) => ({
      quantity: r.quantity === null ? null : Number(r.quantity),
      estimatedUnitCost: r.estimated_unit_cost === null ? null : Number(r.estimated_unit_cost),
    })),
  );

  const { error } = await supabase
    .schema("shopping_list")
    .from("lists")
    .update({
      status: "closed",
      estimated_total: total,
      closed_at: new Date().toISOString(),
      closed_by_user_id: closedByUserId,
    })
    .eq("id", listId)
    .eq("household_id", householdId);
  return { error: error?.message ?? null };
}
