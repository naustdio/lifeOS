import { getCurrentHouseholdId } from "@/modules/core/api";
import { Card, CardContent } from "@/design-system/ui/card";
import {
  getBudgetSettings,
  getBudgetTotalProgress,
  listActiveCategories,
  listBudgetsWithProgress,
} from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { formatCentsAsMXN } from "@/shared/money";
import { BudgetForm } from "./BudgetForm";
import { BudgetSettingsForm } from "./BudgetSettingsForm";

/**
 * Budgets screen (B-005 + settings pass): per-category opt-in limits, plus a settings panel for
 * the period reset day, an overall monthly total (separate from per-category limits), and
 * whether scheduled recurring expenses count as spent. Archived categories fall out of
 * `listActiveCategories` automatically.
 */
export default async function BudgetsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [categories, budgets, settings, totalProgress] = spaceId
    ? await Promise.all([
        listActiveCategories(supabase, spaceId, "expense"),
        listBudgetsWithProgress(supabase, spaceId),
        getBudgetSettings(supabase, spaceId),
        getBudgetTotalProgress(supabase, spaceId),
      ])
    : [[], [], { resetDay: 1, monthlyTotalCents: null, includeScheduledAsSpent: false }, null];

  const sumOfCategoryLimitsCents = budgets.reduce((sum, b) => sum + b.limitCents, 0);

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Presupuestos</h2>

      <BudgetSettingsForm
        resetDay={settings.resetDay}
        monthlyTotalCents={settings.monthlyTotalCents}
        includeScheduledAsSpent={settings.includeScheduledAsSpent}
        sumOfCategoryLimitsCents={sumOfCategoryLimitsCents}
      />

      {totalProgress && (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Presupuesto mensual</span>
            <span className="text-sm">
              Gastado {formatCentsAsMXN(totalProgress.spentCents)} de{" "}
              {formatCentsAsMXN(totalProgress.monthlyTotalCents)}
            </span>
            <span
              className={
                totalProgress.monthlyTotalCents - totalProgress.spentCents < 0
                  ? "text-sm font-semibold text-expense"
                  : "text-sm font-semibold"
              }
            >
              Restante {formatCentsAsMXN(totalProgress.monthlyTotalCents - totalProgress.spentCents)}
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <BudgetForm
            categories={categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId }))}
            budgets={budgets}
          />
        </CardContent>
      </Card>
    </main>
  );
}
