import { notFound } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { getRecipeById, listRecipeChanges } from "@/modules/recipes/api";
import { createClient } from "@/shared/supabase/server";
import { RecipeDetail } from "./RecipeDetail";

/**
 * Server container for the recipe detail screen (recipes-module) — composes `getRecipeById` +
 * `listRecipeChanges` and resolves the caller's role via `core.is_owner` so `RecipeDetail` can
 * gate the hard-delete action client-side (design.md Decision 3's UI layer of defence in depth).
 */
export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) notFound();

  const recipe = await getRecipeById(supabase, id);
  if (!recipe) notFound();

  const [history, { data: isOwner }] = await Promise.all([
    listRecipeChanges(supabase, id),
    supabase.schema("core").rpc("is_owner", { p_household_id: spaceId }),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <RecipeDetail recipe={recipe} history={history} isOwner={Boolean(isOwner)} />
    </main>
  );
}
