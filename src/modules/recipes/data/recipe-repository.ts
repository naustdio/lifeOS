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
  prepMinutes: number | null;
  photoPath: string | null;
  description: string | null;
  createdAt: string;
};

export type RecipeIngredient = {
  id: string;
  position: number;
  name: string;
  quantity: number | null;
  unit: string;
  subRecipeId: string | null;
  estimatedUnitCost: number | null;
};
export type RecipeStep = { id: string; position: number; instruction: string };
export type RecipeDetail = RecipeListItem & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };

const RECIPE_COLUMNS =
  "id, household_id, owner_user_id, title, category, portions, video_url, prep_minutes, photo_path, description, created_at";

function mapRecipeRow(r: Record<string, unknown>): RecipeListItem {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    ownerUserId: r.owner_user_id as string,
    title: r.title as string,
    category: r.category as RecipeCategory,
    portions: Number(r.portions),
    videoUrl: (r.video_url as string | null) ?? null,
    prepMinutes: r.prep_minutes === null || r.prep_minutes === undefined ? null : Number(r.prep_minutes),
    photoPath: (r.photo_path as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Name substring + category filter, excludes soft-deleted rows (spec `recipes-catalog` "Name
 *  Search and Category Filter"). `q` matches either the recipe title OR any of its ingredient
 *  names (UI-polish fast-follow: "search by ingredient") — run as two separate queries and
 *  merged client-side rather than one `.or()` filter string, since `q` is raw user input and
 *  PostgREST's or-filter grammar treats commas/parens as syntax, not literal search text. */
export async function listRecipes(
  supabase: SupabaseClient,
  householdId: string,
  filter?: { q?: string; category?: RecipeCategory },
): Promise<RecipeListItem[]> {
  function baseQuery() {
    let query = supabase
      .schema("recipes")
      .from("recipes")
      .select(RECIPE_COLUMNS)
      .eq("household_id", householdId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    if (filter?.category) {
      query = query.eq("category", filter.category);
    }
    return query;
  }

  if (!filter?.q) {
    const { data, error } = await baseQuery();
    if (error || !data) return [];
    return data.map(mapRecipeRow);
  }

  const [byTitle, ingredientMatches] = await Promise.all([
    baseQuery().ilike("title", `%${filter.q}%`),
    supabase.schema("recipes").from("recipe_ingredients").select("recipe_id").ilike("name", `%${filter.q}%`),
  ]);

  const ingredientRecipeIds = [...new Set((ingredientMatches.data ?? []).map((r) => r.recipe_id as string))];
  const alreadyMatchedIds = new Set((byTitle.data ?? []).map((r) => r.id as string));
  const idsToFetch = ingredientRecipeIds.filter((id) => !alreadyMatchedIds.has(id));

  const byIngredient = idsToFetch.length > 0 ? await baseQuery().in("id", idsToFetch) : { data: [], error: null };

  const rows = [...(byTitle.data ?? []), ...(byIngredient.data ?? [])];
  return rows.map(mapRecipeRow).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Batch-fetches each recipe's ingredient names, keyed by recipe id — feeds `RecipeList`'s
 *  client-side instant filter (UI-polish fast-follow "search by ingredient") so it can match
 *  ingredients without a server round-trip on every keystroke. */
export async function listIngredientNamesByRecipeIds(supabase: SupabaseClient, recipeIds: string[]): Promise<Record<string, string[]>> {
  if (recipeIds.length === 0) return {};
  const { data, error } = await supabase.schema("recipes").from("recipe_ingredients").select("recipe_id, name").in("recipe_id", recipeIds);
  if (error || !data) return {};
  const map: Record<string, string[]> = {};
  for (const row of data) {
    const id = row.recipe_id as string;
    (map[id] ??= []).push(row.name as string);
  }
  return map;
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
    supabase
      .schema("recipes")
      .from("recipe_ingredients")
      .select("id, position, name, quantity, unit, sub_recipe_id, estimated_unit_cost")
      .eq("recipe_id", id)
      .order("position"),
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
      subRecipeId: (r.sub_recipe_id as string | null) ?? null,
      estimatedUnitCost: r.estimated_unit_cost === null ? null : Number(r.estimated_unit_cost),
    })),
    steps: (stepRows ?? []).map((r) => ({ id: r.id as string, position: Number(r.position), instruction: r.instruction as string })),
  };
}

export type IngredientInput = {
  position: number;
  name: string;
  quantity: number | null;
  unit: string;
  subRecipeId: string | null;
  estimatedUnitCost: number | null;
};
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
    prepMinutes: number | null;
    description: string | null;
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
    p_prep_minutes: input.prepMinutes,
    p_description: input.description,
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
    prepMinutes: number | null;
    description: string | null;
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
    p_prep_minutes: input.prepMinutes,
    p_description: input.description,
  });
  return { error: error?.message ?? null };
}

/** RPC wrapper for `recipes.set_recipe_photo` — attaches/clears the recipe's own photo, outside
 *  the write seam (no mandatory-reason audit needed, same reasoning as `ingredient_catalog`). */
export async function setRecipePhoto(supabase: SupabaseClient, recipeId: string, photoPath: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("recipes").rpc("set_recipe_photo", { p_recipe_id: recipeId, p_photo_path: photoPath });
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

/** The calling user's own favorited recipe ids — personal, not household-shared (migration
 *  `20260817223100_recipes_favorites.sql`). RLS already scopes rows to `auth.uid()`, so no
 *  explicit user id filter is needed here. */
export async function listFavoriteRecipeIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.schema("recipes").from("recipe_favorites").select("recipe_id");
  if (error || !data) return [];
  return data.map((r) => r.recipe_id as string);
}

/** Direct writes under RLS, not a write-seam RPC — same reasoning as `ingredient_catalog`:
 *  favoriting carries no mandatory-reason audit requirement. */
export async function addFavorite(supabase: SupabaseClient, userId: string, recipeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("recipes").from("recipe_favorites").insert({ user_id: userId, recipe_id: recipeId });
  return { error: error?.message ?? null };
}

export async function removeFavorite(supabase: SupabaseClient, userId: string, recipeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("recipes").from("recipe_favorites").delete().eq("user_id", userId).eq("recipe_id", recipeId);
  return { error: error?.message ?? null };
}
