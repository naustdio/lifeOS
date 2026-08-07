import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  listActiveAccounts,
  listActiveCategories,
  listBudgetsWithProgress,
  listDueRecurring,
  listRecurringDefinitions,
} from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
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

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Recurrentes</h2>

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
