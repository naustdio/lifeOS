import { notFound } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  getRecipeById,
  listCustomUnits,
  listIngredientCatalog,
  listRecipes,
  RECIPE_UNITS,
  mergeUnitOptions,
  signIngredientPhotoUrls,
  signRecipePhotoUrls,
} from "@/modules/recipes/api";
import type { IngredientCatalogOption } from "@/design-system/patterns/IngredientRow";
import { createClient } from "@/shared/supabase/server";
import { RecipeForm, type RecipeFormInitial } from "../../RecipeForm";

/**
 * Server container for the recipe edit screen (recipes-module) — mirrors `recetas/page.tsx`'s
 * data fetching, scoped to one recipe. `RecipeForm mode="edit"` was already built but never wired
 * to a route; this is that route.
 */
export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) notFound();

  const recipe = await getRecipeById(supabase, id);
  if (!recipe) notFound();

  const [customUnits, catalogEntries, complementoRecipes, photoSignedUrls] = await Promise.all([
    listCustomUnits(supabase, spaceId),
    listIngredientCatalog(supabase, spaceId),
    listRecipes(supabase, spaceId, { category: "complemento" }),
    recipe.photoPath ? signRecipePhotoUrls(supabase, [recipe.photoPath]) : Promise.resolve({} as Record<string, string>),
  ]);

  const units = mergeUnitOptions(RECIPE_UNITS, customUnits);

  const photoPaths = catalogEntries.map((c) => c.photoPath).filter((p): p is string => Boolean(p));
  const signedUrls = await signIngredientPhotoUrls(supabase, photoPaths);
  const catalog: IngredientCatalogOption[] = catalogEntries.map((c) => ({
    name: c.name,
    photoUrl: c.photoPath ? (signedUrls[c.photoPath] ?? null) : null,
    icon: c.icon,
  }));

  const initial: RecipeFormInitial = {
    id: recipe.id,
    title: recipe.title,
    category: recipe.category,
    portions: recipe.portions,
    videoUrl: recipe.videoUrl,
    prepMinutes: recipe.prepMinutes,
    photoUrl: recipe.photoPath ? (photoSignedUrls[recipe.photoPath] ?? null) : null,
    description: recipe.description,
    ingredients: recipe.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      subRecipeId: i.subRecipeId,
      estimatedUnitCost: i.estimatedUnitCost,
    })),
    steps: recipe.steps.map((s) => ({ instruction: s.instruction })),
  };

  return (
    <main className="flex flex-col gap-6">
      <RecipeForm
        mode="edit"
        units={units}
        catalog={catalog}
        recipeOptions={complementoRecipes.filter((r) => r.id !== recipe.id).map((r) => ({ id: r.id, title: r.title }))}
        initial={initial}
      />
    </main>
  );
}
