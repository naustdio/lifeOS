import { getCurrentHouseholdId } from "@/modules/core/api";
import { Card, CardContent } from "@/design-system/ui/card";
import { listActiveCategories, listBudgetsWithProgress } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { BudgetForm } from "./BudgetForm";

/**
 * Minimal budgets screen (B-005): one row per active expense category, opt-in
 * limit + progress bar, "quitar presupuesto" to revert to unbudgeted.
 * Archived categories fall out of `listActiveCategories` automatically —
 * this is the entire mechanism satisfying the archived-category requirement.
 */
export default async function BudgetsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [categories, budgets] = spaceId
    ? await Promise.all([
        listActiveCategories(supabase, spaceId, "expense"),
        listBudgetsWithProgress(supabase, spaceId),
      ])
    : [[], []];

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Presupuestos</h2>
      <Card>
        <CardContent className="pt-6">
          <BudgetForm
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            budgets={budgets}
          />
        </CardContent>
      </Card>
    </main>
  );
}
