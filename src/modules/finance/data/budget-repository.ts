import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repositories for `finance.budgets` + its derived `finance.budget_progress` view
 * (design.md §4, change: finance-budgets B-004). Client-direct RLS reads via
 * `supabase.schema("finance")`, matching the `category-repository.ts`/
 * `summary-repository.ts` pattern: `Number()` every `bigint`-backed column,
 * degrade to `[]` / `null` on error rather than throwing.
 *
 * `upsertBudgetLimit` and `removeBudget` are the deliberate `finance.categories`-style
 * exception to "every write goes through `finance/api`" (already documented in that
 * barrel's header comment): a budget write is a single row with no multi-row invariant
 * and no atomicity requirement, so ordinary RLS-guarded CRUD is proportionate.
 */
export type BudgetProgressItem = {
  budgetId: string;
  categoryId: string;
  limitCents: number;
  spentCents: number;
};

/** All budgets with their derived current-month progress, for the budgets screen. */
export async function listBudgetsWithProgress(
  supabase: SupabaseClient,
  householdId: string,
): Promise<BudgetProgressItem[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("budget_progress")
    .select("budget_id, category_id, limit_cents, spent_cents")
    .eq("household_id", householdId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    budgetId: row.budget_id as string,
    categoryId: row.category_id as string,
    limitCents: Number(row.limit_cents),
    spentCents: Number(row.spent_cents),
  }));
}

/** Progress for a single category, or `null` when that category has no budget. */
export async function getProgressForCategory(
  supabase: SupabaseClient,
  householdId: string,
  categoryId: string,
): Promise<BudgetProgressItem | null> {
  const { data, error } = await supabase
    .schema("finance")
    .from("budget_progress")
    .select("budget_id, category_id, limit_cents, spent_cents")
    .eq("household_id", householdId)
    .eq("category_id", categoryId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    budgetId: data.budget_id as string,
    categoryId: data.category_id as string,
    limitCents: Number(data.limit_cents),
    spentCents: Number(data.spent_cents),
  };
}

/** RLS-guarded upsert on the `(household_id, category_id)` unique constraint. */
export async function upsertBudgetLimit(
  supabase: SupabaseClient,
  householdId: string,
  categoryId: string,
  limitCents: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("budgets")
    .upsert(
      { household_id: householdId, category_id: categoryId, limit_cents: limitCents },
      { onConflict: "household_id,category_id" },
    );

  return { error: error?.message ?? null };
}

/** RLS-guarded hard delete. Budgets have no dependents, so this is a plain DELETE. */
export async function removeBudget(
  supabase: SupabaseClient,
  householdId: string,
  categoryId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("budgets")
    .delete()
    .eq("household_id", householdId)
    .eq("category_id", categoryId);

  return { error: error?.message ?? null };
}
