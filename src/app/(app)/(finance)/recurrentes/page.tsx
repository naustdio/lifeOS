import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  listActiveAccounts,
  listActiveCategories,
  listBudgetsWithProgress,
  listDueRecurring,
  listRecurringDefinitions,
  projectMonthOutflow,
} from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { formatCentsAsMXN } from "@/shared/money";
import { RecurringForm } from "./RecurringForm";
import { RecurringList } from "./RecurringList";

/**
 * Server container for the recurring-expenses screen (design.md §9/§12, change:
 * finance-recurring R-015): definitions, due items, active expense accounts/categories, and
 * budgets (for the confirm sheet's over-budget gate) — mirrors `presupuestos/page.tsx`.
 */
export default async function RecurrentesPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [definitions, dueItems, accounts, expenseCategories, incomeCategories, budgets] = spaceId
    ? await Promise.all([
        listRecurringDefinitions(supabase, spaceId),
        listDueRecurring(supabase, spaceId),
        listActiveAccounts(supabase, spaceId),
        listActiveCategories(supabase, spaceId, "expense"),
        listActiveCategories(supabase, spaceId, "income"),
        listBudgetsWithProgress(supabase, spaceId),
      ])
    : [[], [], [], [], [], []];

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name, class: a.class }));
  const categoryOptions = expenseCategories.map((c) => ({ id: c.id, name: c.name }));
  const incomeCategoryOptions = incomeCategories.map((c) => ({ id: c.id, name: c.name }));

  // Current-month prospected-spend summary (change: finance-subscriptions). Same
  // projectable-definitions filter/map as `calendario/page.tsx` — expense/income definitions
  // only, `transfer` excluded (moves money between the household's own accounts, never spend).
  const todayISO = new Date().toISOString().slice(0, 10);
  const projectableDefinitions = definitions
    .filter((d) => d.type === "expense" || d.type === "income")
    .map((d) => ({
      ...d,
      categoryId: d.categoryId as string,
      kind: (d.type === "income" ? "inflow" : "outflow") as "inflow" | "outflow",
    }));
  const monthOutflow = projectMonthOutflow(projectableDefinitions, todayISO);

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Recurrentes</h2>

      <Card>
        <CardHeader>
          <CardTitle>Gasto recurrente restante este mes</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyAmount kind="expense" formatted={formatCentsAsMXN(monthOutflow.totalCents)} />
        </CardContent>
      </Card>

      <RecurringList
        definitions={definitions}
        dueItems={dueItems}
        accounts={accountOptions}
        categories={categoryOptions}
        budgets={budgets}
      />

      <RecurringForm
        accounts={accountOptions}
        categories={categoryOptions}
        incomeCategories={incomeCategoryOptions}
      />
    </main>
  );
}
