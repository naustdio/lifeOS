import type { SupabaseClient } from "@supabase/supabase-js";

export type HouseholdSummary = {
  availableCents: number;
  debtCents: number;
};

/**
 * `finance.household_summary` read (T-039). `availableCents` is the hero
 * figure (`class = 'asset'` accounts only); `debtCents` is a positive
 * magnitude rendered separately and NEVER subtracted from the hero
 * (design.md §3.3). Zero rows (no accounts yet) resolves to zero/zero rather
 * than an error.
 */
export async function getHouseholdSummary(
  supabase: SupabaseClient,
  householdId: string,
): Promise<HouseholdSummary> {
  const { data, error } = await supabase
    .schema("finance")
    .from("household_summary")
    .select("available_cents, debt_cents")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) {
    return { availableCents: 0, debtCents: 0 };
  }

  return {
    availableCents: Number(data.available_cents),
    debtCents: Number(data.debt_cents),
  };
}

export type MonthSummary = { incomeCents: number; expenseCents: number };

/**
 * `finance.month_summary` read (change: finance-dashboard-feed F-004). Zero rows (no
 * qualifying transactions this month) resolves to zero/zero rather than an error — same
 * degrade-not-throw contract as `getHouseholdSummary`, and the reason the card can never
 * render NaN.
 */
export async function getMonthSummary(
  supabase: SupabaseClient,
  householdId: string,
): Promise<MonthSummary> {
  const { data, error } = await supabase
    .schema("finance")
    .from("month_summary")
    .select("income_cents, expense_cents")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) return { incomeCents: 0, expenseCents: 0 };

  return { incomeCents: Number(data.income_cents), expenseCents: Number(data.expense_cents) };
}

export type CategorySpendRow = { categoryId: string; categoryName: string; spentCents: number };

/**
 * `finance.category_spend` read, ranked highest-first (change: finance-dashboard-feed
 * F-004). `limit` caps the Home card at the top categories; ordering is done server-side
 * so the cap is a true top-N, not a truncated page.
 */
export async function listCategorySpend(
  supabase: SupabaseClient,
  householdId: string,
  limit = 5,
): Promise<CategorySpendRow[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("category_spend")
    .select("category_id, category_name, spent_cents")
    .eq("household_id", householdId)
    .order("spent_cents", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    categoryId: row.category_id as string,
    categoryName: row.category_name as string,
    spentCents: Number(row.spent_cents),
  }));
}
