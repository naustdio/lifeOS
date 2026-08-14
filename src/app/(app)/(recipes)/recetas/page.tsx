import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  listCustomUnits,
  listIngredientCatalog,
  listRecipes,
  RECIPE_UNITS,
  isValidCategory,
  mergeUnitOptions,
  signIngredientPhotoUrls,
  signRecipePhotoUrls,
} from "@/modules/recipes/api";
import type { IngredientCatalogOption } from "@/design-system/patterns/IngredientRow";
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

  const [recipes, customUnits, catalogEntries, complementoRecipes] = spaceId
    ? await Promise.all([
        listRecipes(supabase, spaceId, { q, category: category && isValidCategory(category) ? category : undefined }),
        listCustomUnits(supabase, spaceId),
        listIngredientCatalog(supabase, spaceId),
        // Independent of the list view's own q/category filter — the sub-recipe picker must offer
        // every "complemento" recipe in the household regardless of what's currently being browsed.
        listRecipes(supabase, spaceId, { category: "complemento" }),
      ])
    : [[], [], [], []];

  const units = mergeUnitOptions(RECIPE_UNITS, customUnits);

  const photoPaths = catalogEntries.map((c) => c.photoPath).filter((p): p is string => Boolean(p));
  const signedUrls = spaceId ? await signIngredientPhotoUrls(supabase, photoPaths) : {};
  const catalog: IngredientCatalogOption[] = catalogEntries.map((c) => ({
    name: c.name,
    photoUrl: c.photoPath ? (signedUrls[c.photoPath] ?? null) : null,
    icon: c.icon,
  }));

  const recipePhotoPaths = recipes.map((r) => r.photoPath).filter((p): p is string => Boolean(p));
  const recipeSignedUrls = spaceId ? await signRecipePhotoUrls(supabase, recipePhotoPaths) : {};

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Recetas</h2>

      <RecipeList
        recipes={recipes.map((r) => ({
          id: r.id,
          title: r.title,
          category: r.category,
          portions: r.portions,
          photoUrl: r.photoPath ? (recipeSignedUrls[r.photoPath] ?? null) : null,
          prepMinutes: r.prepMinutes,
        }))}
        initialQuery={q ?? ""}
        initialCategory={category ?? null}
      />

      <RecipeForm
        mode="create"
        units={units}
        catalog={catalog}
        recipeOptions={complementoRecipes.map((r) => ({ id: r.id, title: r.title }))}
      />
    </main>
  );
}
