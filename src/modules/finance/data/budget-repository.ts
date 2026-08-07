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

export type BudgetSettings = {
  resetDay: number;
  monthlyTotalCents: number | null;
  includeScheduledAsSpent: boolean;
};

const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  resetDay: 1,
  monthlyTotalCents: null,
  includeScheduledAsSpent: false,
};

/** Household budget settings — degrades to the same defaults `finance.budget_period_bounds()`
 *  assumes server-side (reset_day=1, no total, scheduled excluded) when no row exists yet. */
export async function getBudgetSettings(
  supabase: SupabaseClient,
  householdId: string,
): Promise<BudgetSettings> {
  const { data, error } = await supabase
    .schema("finance")
    .from("budget_settings")
    .select("reset_day, monthly_total_cents, include_scheduled_as_spent")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_BUDGET_SETTINGS;
  }

  return {
    resetDay: Number(data.reset_day),
    monthlyTotalCents: data.monthly_total_cents === null ? null : Number(data.monthly_total_cents),
    includeScheduledAsSpent: Boolean(data.include_scheduled_as_spent),
  };
}

/** RLS-guarded upsert on the `household_id` primary key — one settings row per household. */
export async function upsertBudgetSettings(
  supabase: SupabaseClient,
  householdId: string,
  settings: BudgetSettings,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("budget_settings")
    .upsert(
      {
        household_id: householdId,
        reset_day: settings.resetDay,
        monthly_total_cents: settings.monthlyTotalCents,
        include_scheduled_as_spent: settings.includeScheduledAsSpent,
      },
      { onConflict: "household_id" },
    );

  return { error: error?.message ?? null };
}

export type BudgetTotalProgress = {
  monthlyTotalCents: number;
  spentCents: number;
  periodStart: string;
  periodEnd: string;
};

/** Overall monthly-total progress, or `null` when no total budget is configured. */
export async function getBudgetTotalProgress(
  supabase: SupabaseClient,
  householdId: string,
): Promise<BudgetTotalProgress | null> {
  const { data, error } = await supabase
    .schema("finance")
    .from("budget_total_progress")
    .select("monthly_total_cents, spent_cents, period_start, period_end")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    monthlyTotalCents: Number(data.monthly_total_cents),
    spentCents: Number(data.spent_cents),
    periodStart: data.period_start as string,
    periodEnd: data.period_end as string,
  };
}
