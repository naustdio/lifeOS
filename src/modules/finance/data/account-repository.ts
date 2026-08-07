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

/**
 * Card terms + derived numbers, over `finance.credit_card_status` (design.md §1d, change:
 * finance-credit-card-payments CC-019). Every derived column is NULL-safe on the empty state
 * (`has_terms = false`), so callers never see `NaN`.
 */
export type CreditCardStatusItem = {
  accountId: string;
  householdId: string;
  name: string;
  balanceCents: number;
  owedCents: number;
  creditLimitCents: number | null;
  statementDay: number | null;
  dueDay: number | null;
  minPaymentCents: number | null;
  nextDueDate: string | null;
  daysUntilDue: number | null;
  utilizationBp: number | null;
  overLimit: boolean;
  hasTerms: boolean;
};

/** All active credit-card accounts for the space, with their derived due/limit numbers. */
export async function listCreditCardStatus(
  supabase: SupabaseClient,
  householdId: string,
): Promise<CreditCardStatusItem[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("credit_card_status")
    .select(
      "account_id, household_id, name, balance_cents, owed_cents, credit_limit_cents, statement_day, due_day, min_payment_cents, next_due_date, days_until_due, utilization_bp, over_limit, has_terms",
    )
    .eq("household_id", householdId);

  if (error || !data) {
    return [];
  }

  return data.map((r) => ({
    accountId: r.account_id as string,
    householdId: r.household_id as string,
    name: r.name as string,
    balanceCents: Number(r.balance_cents),
    owedCents: Number(r.owed_cents),
    creditLimitCents: r.credit_limit_cents === null ? null : Number(r.credit_limit_cents),
    statementDay: r.statement_day === null ? null : Number(r.statement_day),
    dueDay: r.due_day === null ? null : Number(r.due_day),
    minPaymentCents: r.min_payment_cents === null ? null : Number(r.min_payment_cents),
    nextDueDate: (r.next_due_date as string | null) ?? null,
    daysUntilDue: r.days_until_due === null ? null : Number(r.days_until_due),
    utilizationBp: r.utilization_bp === null ? null : Number(r.utilization_bp),
    overLimit: r.over_limit as boolean,
    hasTerms: r.has_terms as boolean,
  }));
}

/**
 * RLS-guarded upsert on `finance.account_credit_card_details`'s primary key (`account_id`).
 * Deliberately NOT part of `createAccount()` (design.md Decision 2) — card terms guard no
 * balance invariant, so this is the same documented `finance.categories`-style plain-RLS
 * exception as `budget-repository.ts`'s `upsertBudgetLimit`. A failed second-step call here
 * after `createAccount()` leaves a valid card with no terms — the defined empty state, not a
 * broken account.
 */
export async function upsertCardDetails(
  supabase: SupabaseClient,
  accountId: string,
  detail: {
    creditLimitCents?: number | null;
    statementDay?: number | null;
    dueDay?: number | null;
    minPaymentCents?: number | null;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("account_credit_card_details")
    .upsert(
      {
        account_id: accountId,
        credit_limit_cents: detail.creditLimitCents ?? null,
        statement_day: detail.statementDay ?? null,
        due_day: detail.dueDay ?? null,
        min_payment_cents: detail.minPaymentCents ?? null,
      },
      { onConflict: "account_id" },
    );

  return { error: error?.message ?? null };
}

/** RLS-guarded hard delete. Removing terms is a real user action with no history to preserve
 *  (design.md §1a) — the account and its balance are untouched. */
export async function removeCardDetails(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("account_credit_card_details")
    .delete()
    .eq("account_id", accountId);

  return { error: error?.message ?? null };
}
