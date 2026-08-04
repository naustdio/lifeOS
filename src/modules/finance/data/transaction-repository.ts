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
    .select("id, account_id, category_id, type, amount_cents, occurred_on, description, status, transfer_group_id")
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
  };
}

/**
 * Recent posted+void transactions for the current space, newest first
 * (T-037/T-038's history list and correction affordance). Read only, joined
 * client-side against the small account/category name maps rather than a
 * PostgREST embedded join, to keep this repository trivial to reason about.
 */
export async function listRecentTransactions(
  supabase: SupabaseClient,
  householdId: string,
  limit = 25,
): Promise<TransactionListItem[]> {
  const { data: rows, error } = await supabase
    .schema("finance")
    .from("transactions")
    .select("id, account_id, category_id, type, amount_cents, occurred_on, description, status, transfer_group_id")
    .eq("household_id", householdId)
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
  }));
}
