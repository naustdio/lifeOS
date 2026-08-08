import { getCurrentHouseholdId } from "@/modules/core/api";
import { listCategoryTree } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { CategoryList } from "./CategoryList";

/**
 * Server container for the `/categorias` management screen (design.md §5, change:
 * finance-categories-icon-color C-019): fetch the household's two-level category tree, render
 * `<CategoryList>`. Mirrors `presupuestos/page.tsx`'s shape.
 */
export default async function CategoriasPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const tree = spaceId ? await listCategoryTree(supabase, spaceId) : [];

  return (
    <main className="flex flex-col gap-6">
      <CategoryList tree={tree} />
    </main>
  );
}
