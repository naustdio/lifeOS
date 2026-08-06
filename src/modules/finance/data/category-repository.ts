import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryKind } from "../domain/category";

export type CategoryListItem = {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  icon: string | null;
  color: string | null;
};

/**
 * Two-level tree node for the `/categorias` management screen (design.md §4/§5, change:
 * finance-categories-icon-color C-010). Includes archived categories (flagged, not hidden) —
 * distinct from `listActiveCategories`, which is the picker-facing, archived-excluded read.
 */
export type CategoryTreeItem = CategoryListItem & {
  archivedAt: string | null;
  children: CategoryTreeItem[];
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
    .select("id, name, kind, parent_id, icon, color")
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
    icon: (c.icon as string | null) ?? null,
    color: (c.color as string | null) ?? null,
  }));
}

/**
 * Full two-level tree for the `/categorias` management screen (design.md §4, C-010). Includes
 * archived rows so the screen can show them flagged rather than silently dropping them — the
 * picker-facing `listActiveCategories` above stays the archived-excluded read used elsewhere.
 */
export async function listCategoryTree(
  supabase: SupabaseClient,
  householdId: string,
): Promise<CategoryTreeItem[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("categories")
    .select("id, name, kind, parent_id, icon, color, archived_at")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return [];
  }

  const nodes = new Map<string, CategoryTreeItem>();
  for (const c of data) {
    nodes.set(c.id as string, {
      id: c.id as string,
      name: c.name as string,
      kind: c.kind as CategoryKind,
      parentId: (c.parent_id as string | null) ?? null,
      icon: (c.icon as string | null) ?? null,
      color: (c.color as string | null) ?? null,
      archivedAt: (c.archived_at as string | null) ?? null,
      children: [],
    });
  }

  const roots: CategoryTreeItem[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * RLS-guarded insert. `icon`/`color` are optional — omitting either submits `null`, and
 * `CategoryChip` renders the fallback (design.md §4, `User-Created Categories`). Shape
 * (depth/kind) is enforced by the existing `BEFORE INSERT` trigger, not re-implemented here.
 */
export async function createCategory(
  supabase: SupabaseClient,
  householdId: string,
  input: {
    name: string;
    kind: CategoryKind;
    parentId: string | null;
    icon: string | null;
    color: string | null;
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("finance")
    .from("categories")
    .insert({
      household_id: householdId,
      name: input.name,
      kind: input.kind,
      parent_id: input.parentId,
      icon: input.icon,
      color: input.color,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "insert failed" };
  }

  return { id: data.id as string, error: null };
}

/**
 * RLS-guarded update. Never accepts `kind`/`parentId`/`householdId` — reparenting and kind
 * changes are explicit non-goals (design.md §4, §6 Decision 7), so this screen structurally
 * cannot reach the shape trigger with a re-shaping update.
 */
export async function updateCategory(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
  patch: { name?: string; icon?: string | null; color?: string | null },
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.color !== undefined) update.color = patch.color;

  const { error } = await supabase
    .schema("finance")
    .from("categories")
    .update(update)
    .eq("id", id)
    .eq("household_id", householdId);

  return { error: error?.message ?? null };
}

/** Archive, never delete — there is no DELETE policy or grant on `finance.categories`. */
export async function archiveCategory(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", householdId);

  return { error: error?.message ?? null };
}
