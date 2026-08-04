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
