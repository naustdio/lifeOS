import type { SupabaseClient } from "@supabase/supabase-js";

export type TransactionListItem = {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  occurredOn: string;
  description: string;
  status: "posted" | "void";
  transferGroupId: string | null;
  /** change: finance-transaction-subtypes. `null` when the row has no sub-type — the pre-change
   *  default, unaffected. */
  subtype: string | null;
};

/** A single transaction by id, scoped to the current space (T-038's edit
 * screen). Returns null when absent or out of scope — RLS already prevents
 * cross-space reads, this is just the ergonomic single-row lookup. */
export async function getTransactionById(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
): Promise<TransactionListItem | null> {
  const { data, error } = await supabase
    .schema("finance")
    .from("transactions")
    .select(
      "id, account_id, category_id, type, amount_cents, occurred_on, description, status, transfer_group_id, subtype",
    )
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    accountId: data.account_id as string,
    accountName: "",
    categoryId: (data.category_id as string | null) ?? null,
    categoryName: null,
    type: data.type as "income" | "expense" | "transfer",
    amountCents: Number(data.amount_cents),
    occurredOn: data.occurred_on as string,
    description: (data.description as string) ?? "",
    status: data.status as "posted" | "void",
    transferGroupId: (data.transfer_group_id as string | null) ?? null,
    subtype: (data.subtype as string | null) ?? null,
  };
}

/**
 * Recent posted+void transactions for the current space, newest first
 * (T-037/T-038's history list and correction affordance). Read only, joined
 * client-side against the small account/category name maps rather than a
 * PostgREST embedded join, to keep this repository trivial to reason about.
 *
 * `options.postedOnly` (change: finance-dashboard-feed F-005) is additive, trailing, and
 * defaulted — every existing call site (e.g. `/movimientos`) is unchanged: omitting it
 * returns posted AND void rows exactly as before, required for `/movimientos`'s correction
 * display. Home's recent-movements preview passes `{ postedOnly: true }` to exclude void rows.
 */
export async function listRecentTransactions(
  supabase: SupabaseClient,
  householdId: string,
  limit = 25,
  options: { postedOnly?: boolean } = {},
): Promise<TransactionListItem[]> {
  const base = supabase
    .schema("finance")
    .from("transactions")
    .select(
      "id, account_id, category_id, type, amount_cents, occurred_on, description, status, transfer_group_id, subtype",
    )
    .eq("household_id", householdId);

  const query = options.postedOnly ? base.eq("status", "posted") : base;

  const { data: rows, error } = await query
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error || !rows || rows.length === 0) {
    return [];
  }

  const accountIds = Array.from(new Set(rows.map((r) => r.account_id as string)));
  const categoryIds = Array.from(
    new Set(rows.map((r) => r.category_id as string | null).filter((id): id is string => id !== null)),
  );

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.schema("finance").from("accounts").select("id, name").in("id", accountIds),
    categoryIds.length > 0
      ? supabase.schema("finance").from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const accountNameById = new Map((accounts ?? []).map((a) => [a.id as string, a.name as string]));
  const categoryNameById = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    accountId: r.account_id as string,
    accountName: accountNameById.get(r.account_id as string) ?? "",
    categoryId: (r.category_id as string | null) ?? null,
    categoryName: r.category_id ? (categoryNameById.get(r.category_id as string) ?? null) : null,
    type: r.type as "income" | "expense" | "transfer",
    amountCents: Number(r.amount_cents),
    occurredOn: r.occurred_on as string,
    description: (r.description as string) ?? "",
    status: r.status as "posted" | "void",
    transferGroupId: (r.transfer_group_id as string | null) ?? null,
    subtype: (r.subtype as string | null) ?? null,
  }));
}

/**
 * change: health-tracking (design.md Decision 1, "two-hop indirection"). Every posted
 * occurrence of a recurring definition, newest first — resolved via
 * `finance.transactions.recurring_id`, which `confirm_recurring_transaction` populates on every
 * branch. This is deliberately NOT `findByOrigin`: a recurring series is 1:N over time with the
 * same origin entity id and different idempotency keys, so overloading the 1:1 origin-ref
 * contract would make it ambiguous rather than correct. Plain RLS-guarded SELECT, no new
 * RPC/SQL seam function.
 */
export async function listTransactionsByRecurring(
  supabase: SupabaseClient,
  householdId: string,
  recurringId: string,
): Promise<TransactionListItem[]> {
  const { data: rows, error } = await supabase
    .schema("finance")
    .from("transactions")
    .select(
      "id, account_id, category_id, type, amount_cents, occurred_on, description, status, transfer_group_id, subtype",
    )
    .eq("household_id", householdId)
    .eq("recurring_id", recurringId)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false });

  if (error || !rows) {
    return [];
  }

  return rows.map((r) => ({
    id: r.id as string,
    accountId: r.account_id as string,
    accountName: "",
    categoryId: (r.category_id as string | null) ?? null,
    categoryName: null,
    type: r.type as "income" | "expense" | "transfer",
    amountCents: Number(r.amount_cents),
    occurredOn: r.occurred_on as string,
    description: (r.description as string) ?? "",
    status: r.status as "posted" | "void",
    transferGroupId: (r.transfer_group_id as string | null) ?? null,
    subtype: (r.subtype as string | null) ?? null,
  }));
}
