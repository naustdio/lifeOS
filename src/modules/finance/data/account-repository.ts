import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType } from "../domain/account";

/**
 * Repositories for `finance.accounts` + its derived-balance view + detail
 * tables (T-036, T-039). Reads only — writes go exclusively through
 * `finance/api`'s `createAccount()` seam (design.md §5.6), never through
 * these repositories.
 */
export type AccountListItem = {
  id: string;
  name: string;
  type: AccountType;
  class: "asset" | "liability";
  visibility: "household" | "private";
  balanceCents: number;
  liability?: {
    interestRateBp: number;
    termMonths: number;
    monthlyPaymentCents: number;
    startDate: string;
  };
  goal?: {
    targetAmountCents: number;
    targetDate: string | null;
  };
};

/** Active (non-archived) accounts for the current space, with derived balances. */
export async function listActiveAccounts(
  supabase: SupabaseClient,
  householdId: string,
): Promise<AccountListItem[]> {
  const { data: accounts, error } = await supabase
    .schema("finance")
    .from("accounts")
    .select("id, name, type, class, visibility, archived_at")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error || !accounts || accounts.length === 0) {
    return [];
  }

  const ids = accounts.map((a) => a.id as string);

  const [{ data: balances }, { data: liabilities }, { data: goals }] = await Promise.all([
    supabase.schema("finance").from("account_balances").select("account_id, balance_cents").in("account_id", ids),
    supabase
      .schema("finance")
      .from("account_liability_details")
      .select("account_id, interest_rate_bp, term_months, monthly_payment_cents, start_date")
      .in("account_id", ids),
    supabase
      .schema("finance")
      .from("account_goal_details")
      .select("account_id, target_amount_cents, target_date")
      .in("account_id", ids),
  ]);

  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id as string, Number(b.balance_cents)]));
  const liabilityByAccount = new Map((liabilities ?? []).map((l) => [l.account_id as string, l]));
  const goalByAccount = new Map((goals ?? []).map((g) => [g.account_id as string, g]));

  return accounts.map((a) => {
    const liab = liabilityByAccount.get(a.id as string);
    const goal = goalByAccount.get(a.id as string);
    return {
      id: a.id as string,
      name: a.name as string,
      type: a.type as AccountType,
      class: a.class as "asset" | "liability",
      visibility: a.visibility as "household" | "private",
      balanceCents: balanceByAccount.get(a.id as string) ?? 0,
      liability: liab
        ? {
            interestRateBp: Number(liab.interest_rate_bp),
            termMonths: Number(liab.term_months),
            monthlyPaymentCents: Number(liab.monthly_payment_cents),
            startDate: liab.start_date as string,
          }
        : undefined,
      goal: goal
        ? {
            targetAmountCents: Number(goal.target_amount_cents),
            targetDate: (goal.target_date as string | null) ?? null,
          }
        : undefined,
    };
  });
}
