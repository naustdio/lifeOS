import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for `recipes.recipe_changes` — the append-only audit trail (design.md Decision 1/2).
 * Read-only: every write to this table happens exclusively inside the seam functions in
 * `recipe-repository.ts`'s RPC wrappers, never here.
 */
export type RecipeChange = {
  id: string;
  recipeId: string | null;
  recipeTitle: string;
  actorUserId: string;
  action: "created" | "edited" | "soft_deleted" | "restored" | "hard_deleted";
  reason: string;
  createdAt: string;
};

/** Oldest-first history for one recipe (spec `recipes-history` "Collapsed History View with
 *  Actor, Timestamp, and Reason"). Still resolves after a hard delete, since `recipe_changes` rows
 *  survive with `recipe_id` set to null and RLS scopes on the denormalized `household_id` — this
 *  function is for a still-existing recipe's own detail page, so it filters on `recipe_id`. */
export async function listRecipeChanges(supabase: SupabaseClient, recipeId: string): Promise<RecipeChange[]> {
  const { data, error } = await supabase
    .schema("recipes")
    .from("recipe_changes")
    .select("id, recipe_id, recipe_title, actor_user_id, action, reason, created_at")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((r) => ({
    id: r.id as string,
    recipeId: (r.recipe_id as string | null) ?? null,
    recipeTitle: r.recipe_title as string,
    actorUserId: r.actor_user_id as string,
    action: r.action as RecipeChange["action"],
    reason: r.reason as string,
    createdAt: r.created_at as string,
  }));
}
