import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType } from "../domain/account";

/**
 * Repositories for `finance.accounts` + its derived-balance view + detail
 * tables (T-036, T-039). Mostly reads — every write to `finance.accounts`
 * itself still goes exclusively through `finance/api`'s seam functions
 * (`createAccount`, `updateAccount`, `setAccountArchived`, `deleteAccount`),
 * which call SECURITY DEFINER RPCs (design.md §5.6); this file never writes
 * to `finance.accounts` directly. `upsertCardDetails`/`removeCardDetails`
 * below are the one documented exception (design.md Decision 2): plain
 * RLS-guarded writes to the optional `account_credit_card_details` table,
 * which guards no account-level invariant.
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
  investment?: {
    costBasisCents: number;
    currentValueCents: number;
    valuedOn: string;
  };
  loaned?: {
    counterpartyName: string;
    originalAmountCents: number;
    termMonths: number | null;
    expectedReturnDate: string | null;
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

  return hydrateAccountListItems(supabase, accounts as RawAccountRow[]);
}

/**
 * Archived (paused) accounts for the "Pausadas" section (change: finance-account-edit T2.2).
 * Sibling to `listActiveAccounts` — same read shape, `archived_at is not null` instead of
 * `is null`. Symmetric and easy to reason about next to the active-list function it mirrors.
 */
export async function listArchivedAccounts(
  supabase: SupabaseClient,
  householdId: string,
): Promise<AccountListItem[]> {
  const { data: accounts, error } = await supabase
    .schema("finance")
    .from("accounts")
    .select("id, name, type, class, visibility, archived_at")
    .eq("household_id", householdId)
    .not("archived_at", "is", null)
    .order("sort_order", { ascending: true });

  if (error || !accounts || accounts.length === 0) {
    return [];
  }

  return hydrateAccountListItems(supabase, accounts as RawAccountRow[]);
}

type RawAccountRow = { id: unknown; name: unknown; type: unknown; class: unknown; visibility: unknown };

/** Shared detail-row hydration for `listActiveAccounts`/`listArchivedAccounts` — extracted so
 *  the two lists cannot silently drift on which detail tables they join. */
async function hydrateAccountListItems(
  supabase: SupabaseClient,
  accounts: RawAccountRow[],
): Promise<AccountListItem[]> {
  const ids = accounts.map((a) => a.id as string);

  const [{ data: balances }, { data: liabilities }, { data: goals }, { data: investments }, { data: loans }] =
    await Promise.all([
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
      supabase
        .schema("finance")
        .from("account_investment_details")
        .select("account_id, cost_basis_cents, current_value_cents, valued_on")
        .in("account_id", ids),
      supabase
        .schema("finance")
        .from("account_loaned_details")
        .select("account_id, counterparty_name, original_amount_cents, term_months, expected_return_date")
        .in("account_id", ids),
    ]);

  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id as string, Number(b.balance_cents)]));
  const liabilityByAccount = new Map((liabilities ?? []).map((l) => [l.account_id as string, l]));
  const goalByAccount = new Map((goals ?? []).map((g) => [g.account_id as string, g]));
  const investmentByAccount = new Map((investments ?? []).map((v) => [v.account_id as string, v]));
  const loanedByAccount = new Map((loans ?? []).map((l) => [l.account_id as string, l]));

  return accounts.map((a) => {
    const liab = liabilityByAccount.get(a.id as string);
    const goal = goalByAccount.get(a.id as string);
    const investment = investmentByAccount.get(a.id as string);
    const loaned = loanedByAccount.get(a.id as string);
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
      investment: investment
        ? {
            costBasisCents: Number(investment.cost_basis_cents),
            currentValueCents: Number(investment.current_value_cents),
            valuedOn: investment.valued_on as string,
          }
        : undefined,
      loaned: loaned
        ? {
            counterpartyName: loaned.counterparty_name as string,
            originalAmountCents: Number(loaned.original_amount_cents),
            termMonths: (loaned.term_months as number | null) ?? null,
            expectedReturnDate: (loaned.expected_return_date as string | null) ?? null,
          }
        : undefined,
    };
  });
}

export type AccountDetail = AccountListItem & {
  archivedAt: string | null;
  /** Existing card terms, present only for a `credit_card` account that already has a saved
   *  `account_credit_card_details` row (fix for sdd-verify CRITICAL-1, change:
   *  finance-account-edit). Without this, the edit route had no way to prefill
   *  `AccountTypeFields`'s card fieldset, so it always rendered blank — and submitting even ONE
   *  card field then silently NULLed the other three via `upsertCardDetails`'s full-row upsert. */
  card?: {
    creditLimitCents: number | null;
    statementDay: number | null;
    dueDay: number | null;
    minPaymentCents: number | null;
  };
};

/**
 * A single account by id, for the edit route (change: finance-account-edit T2.1). Deliberately
 * WITHOUT `.is("archived_at", null)` filtering — a paused account must still be openable for
 * editing/reactivation (design.md's whole point of the "Pausadas" section). Returns `null` for
 * a missing id or one belonging to another household, letting the route call `notFound()`.
 */
export async function getAccountById(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
): Promise<AccountDetail | null> {
  const { data: account, error } = await supabase
    .schema("finance")
    .from("accounts")
    .select("id, name, type, class, visibility, archived_at")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (error || !account) {
    return null;
  }

  const [item] = await hydrateAccountListItems(supabase, [account as RawAccountRow]);
  const detail: AccountDetail = { ...item, archivedAt: (account.archived_at as string | null) ?? null };

  if ((account.type as AccountType) === "credit_card") {
    const { data: card } = await supabase
      .schema("finance")
      .from("account_credit_card_details")
      .select("credit_limit_cents, statement_day, due_day, min_payment_cents")
      .eq("account_id", id)
      .maybeSingle();

    if (card) {
      detail.card = {
        creditLimitCents: card.credit_limit_cents === null ? null : Number(card.credit_limit_cents),
        statementDay: card.statement_day === null ? null : Number(card.statement_day),
        dueDay: card.due_day === null ? null : Number(card.due_day),
        minPaymentCents: card.min_payment_cents === null ? null : Number(card.min_payment_cents),
      };
    }
  }

  return detail;
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
