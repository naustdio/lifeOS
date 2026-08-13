import { getCurrentHouseholdId } from "@/modules/core/api";
import { listCustomUnits, listRecipes, RECIPE_UNITS, isValidCategory, mergeUnitOptions } from "@/modules/recipes/api";
import { createClient } from "@/shared/supabase/server";
import { RecipeForm } from "./RecipeForm";
import { RecipeList } from "./RecipeList";

/**
 * Server container for the recipes list screen (recipes-module) — mirrors `nutricion/page.tsx`'s
 * shape. `searchParams` carries `q`/`category` so a shared/reloaded URL reproduces the same
 * server-rendered view; `RecipeList` also filters client-side for instant feedback.
 */
export default async function RecetasPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q, category } = await searchParams;
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [recipes, customUnits] = spaceId
    ? await Promise.all([
        listRecipes(supabase, spaceId, { q, category: category && isValidCategory(category) ? category : undefined }),
        listCustomUnits(supabase, spaceId),
      ])
    : [[], []];

  const units = mergeUnitOptions(RECIPE_UNITS, customUnits);

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Recetas</h2>

      <RecipeList
        recipes={recipes.map((r) => ({ id: r.id, title: r.title, category: r.category, portions: r.portions }))}
        initialQuery={q ?? ""}
        initialCategory={category ?? null}
      />

      <RecipeForm mode="create" units={units} />
    </main>
  );
}
