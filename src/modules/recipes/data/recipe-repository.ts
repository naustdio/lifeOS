import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeCategory } from "../domain/recipe";

/**
 * Repository for `recipes.recipes` + its relational children (design.md Schema, migrations
 * `20260813090039_recipes_schema.sql` / `..._api.sql` / `..._security.sql`). Reads are plain
 * RLS-guarded `select`, matching every other module's repository shape. Writes are NEVER plain
 * inserts/updates — `recipes.recipes` has no INSERT/UPDATE grant at all (design.md Decision 1);
 * every mutation goes through the `security definer` seam functions via `.rpc(...)`, so this
 * repository's write functions are thin RPC wrappers, not CRUD.
 */
export type RecipeListItem = {
  id: string;
  householdId: string;
  ownerUserId: string;
  title: string;
  category: RecipeCategory;
  portions: number;
  videoUrl: string | null;
  createdAt: string;
};

export type RecipeIngredient = { id: string; position: number; name: string; quantity: number | null; unit: string };
export type RecipeStep = { id: string; position: number; instruction: string };
export type RecipeDetail = RecipeListItem & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };

const RECIPE_COLUMNS = "id, household_id, owner_user_id, title, category, portions, video_url, created_at";

function mapRecipeRow(r: Record<string, unknown>): RecipeListItem {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    ownerUserId: r.owner_user_id as string,
    title: r.title as string,
    category: r.category as RecipeCategory,
    portions: Number(r.portions),
    videoUrl: (r.video_url as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Name substring + category filter, excludes soft-deleted rows (spec `recipes-catalog` "Name
 *  Search and Category Filter"). */
export async function listRecipes(
  supabase: SupabaseClient,
  householdId: string,
  filter?: { q?: string; category?: RecipeCategory },
): Promise<RecipeListItem[]> {
  let query = supabase
    .schema("recipes")
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .eq("household_id", householdId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (filter?.q) {
    query = query.ilike("title", `%${filter.q}%`);
  }
  if (filter?.category) {
    query = query.eq("category", filter.category);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }
  return data.map(mapRecipeRow);
}

/** A single recipe with its ordered ingredients and steps. RLS already excludes another
 *  household's recipe — returns null when absent, out of scope, or soft-deleted. */
export async function getRecipeById(supabase: SupabaseClient, id: string): Promise<RecipeDetail | null> {
  const { data: recipeRow, error: recipeErr } = await supabase
    .schema("recipes")
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (recipeErr || !recipeRow) return null;

  const [{ data: ingredientRows }, { data: stepRows }] = await Promise.all([
    supabase.schema("recipes").from("recipe_ingredients").select("id, position, name, quantity, unit").eq("recipe_id", id).order("position"),
    supabase.schema("recipes").from("recipe_steps").select("id, position, instruction").eq("recipe_id", id).order("position"),
  ]);

  return {
    ...mapRecipeRow(recipeRow),
    ingredients: (ingredientRows ?? []).map((r) => ({
      id: r.id as string,
      position: Number(r.position),
      name: r.name as string,
      quantity: r.quantity === null ? null : Number(r.quantity),
      unit: r.unit as string,
    })),
    steps: (stepRows ?? []).map((r) => ({ id: r.id as string, position: Number(r.position), instruction: r.instruction as string })),
  };
}

export type IngredientInput = { position: number; name: string; quantity: number | null; unit: string };
export type StepInput = { position: number; instruction: string };

/** RPC wrapper for `recipes.create_recipe` — writes the recipe, its ingredients/steps, and its
 *  mandatory-reason `recipe_changes` row in one transaction (design.md Decision 1). */
export async function createRecipe(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    title: string;
    category: RecipeCategory;
    portions: number;
    videoUrl: string | null;
    ingredients: IngredientInput[];
    steps: StepInput[];
    reason: string;
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.schema("recipes").rpc("create_recipe", {
    p_household_id: input.householdId,
    p_title: input.title,
    p_category: input.category,
    p_portions: input.portions,
    p_video_url: input.videoUrl,
    p_ingredients: input.ingredients,
    p_steps: input.steps,
    p_reason: input.reason,
  });
  if (error || !data) {
    return { id: null, error: error?.message ?? "create failed" };
  }
  return { id: data as string, error: null };
}

/** RPC wrapper for `recipes.update_recipe`. */
export async function updateRecipe(
  supabase: SupabaseClient,
  input: {
    recipeId: string;
    title: string;
    category: RecipeCategory;
    portions: number;
    videoUrl: string | null;
    ingredients: IngredientInput[];
    steps: StepInput[];
    reason: string;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("recipes").rpc("update_recipe", {
    p_recipe_id: input.recipeId,
    p_title: input.title,
    p_category: input.category,
    p_portions: input.portions,
    p_video_url: input.videoUrl,
    p_ingredients: input.ingredients,
    p_steps: input.steps,
    p_reason: input.reason,
  });
  return { error: error?.message ?? null };
}

/** RPC wrapper for `recipes.soft_delete_recipe` — excludes the recipe from listing/search while
 *  its row and history survive (spec `recipes-history`). */
export async function softDeleteRecipe(supabase: SupabaseClient, recipeId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("recipes").rpc("soft_delete_recipe", { p_recipe_id: recipeId, p_reason: reason });
  return { error: error?.message ?? null };
}

/** RPC wrapper for `recipes.hard_delete_recipe` — owner-only, gated inside the function
 *  (design.md Decision 3); the audit row survives as a title-stamped orphan (Decision 2). */
export async function hardDeleteRecipe(supabase: SupabaseClient, recipeId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("recipes").rpc("hard_delete_recipe", { p_recipe_id: recipeId, p_reason: reason });
  return { error: error?.message ?? null };
}
