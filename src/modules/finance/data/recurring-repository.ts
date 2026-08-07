import type { SupabaseClient } from "@supabase/supabase-js";
import type { Frequency, RecurringType } from "../domain/recurring";

/**
 * Repository for `finance.recurring_transactions` + its derived `finance.recurring_due` view
 * (design.md §7, change: finance-recurring R-007). Client-direct RLS reads/writes in the
 * `budget-repository.ts` shape: `Number()` every `bigint` column, degrade to `[]`/`null` on
 * error rather than throwing. CRUD/pause/resume/delete are the same documented
 * `finance.categories`-style plain-RLS exception; only confirm/discard go through `.rpc()`
 * (see `finance/api/index.ts`).
 */
export type RecurringListItem = {
  id: string;
  householdId: string;
  accountId: string;
  categoryId: string | null;
  type: RecurringType;
  toAccountId: string | null;
  amountCents: number;
  description: string;
  frequency: Frequency;
  nextDueDate: string;
  active: boolean;
};

export type DueRecurringItem = {
  recurringId: string;
  householdId: string;
  accountId: string;
  categoryId: string | null;
  type: RecurringType;
  toAccountId: string | null;
  amountCents: number;
  description: string;
  frequency: Frequency;
  nextDueDate: string;
  daysOverdue: number;
};

/** All recurring definitions for the space, most-due-first. */
export async function listRecurringDefinitions(
  supabase: SupabaseClient,
  householdId: string,
): Promise<RecurringListItem[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("recurring_transactions")
    .select(
      "id, household_id, account_id, category_id, type, to_account_id, amount_cents, description, frequency, next_due_date, active",
    )
    .eq("household_id", householdId)
    .order("next_due_date", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((r) => ({
    id: r.id as string,
    householdId: r.household_id as string,
    accountId: r.account_id as string,
    categoryId: (r.category_id as string | null) ?? null,
    type: r.type as RecurringType,
    toAccountId: (r.to_account_id as string | null) ?? null,
    amountCents: Number(r.amount_cents),
    description: r.description as string,
    frequency: r.frequency as Frequency,
    nextDueDate: r.next_due_date as string,
    active: r.active as boolean,
  }));
}

/** Due/overdue items for the space, via the `security_invoker` view (never bypasses RLS). */
export async function listDueRecurring(supabase: SupabaseClient, householdId: string): Promise<DueRecurringItem[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("recurring_due")
    .select(
      "recurring_id, household_id, account_id, category_id, type, to_account_id, amount_cents, description, frequency, next_due_date, days_overdue",
    )
    .eq("household_id", householdId)
    .order("days_overdue", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((r) => ({
    recurringId: r.recurring_id as string,
    householdId: r.household_id as string,
    accountId: r.account_id as string,
    categoryId: (r.category_id as string | null) ?? null,
    type: r.type as RecurringType,
    toAccountId: (r.to_account_id as string | null) ?? null,
    amountCents: Number(r.amount_cents),
    description: r.description as string,
    frequency: r.frequency as Frequency,
    nextDueDate: r.next_due_date as string,
    daysOverdue: Number(r.days_overdue),
  }));
}

/** Count of due/overdue items — the Home banner's data source. Degrades to 0 on error. */
export async function countDueRecurring(supabase: SupabaseClient, householdId: string): Promise<number> {
  const { count, error } = await supabase
    .schema("finance")
    .from("recurring_due")
    .select("recurring_id", { count: "exact", head: true })
    .eq("household_id", householdId);

  if (error || count === null) {
    return 0;
  }

  return count;
}

/**
 * RLS-guarded insert. Creating a definition never posts a transaction (proposal). Accepts
 * either shape (design.md §3, change: finance-credit-card-payments CC-020): `type: "expense"`
 * carries `categoryId`, `type: "transfer"` carries `toAccountId` instead — mirroring
 * `recurring_expense_shape`/`recurring_transfer_shape`. Callers should run
 * `validateRecurringShape()` before calling this; the DB CHECKs remain the source of truth.
 */
export async function createRecurringDefinition(
  supabase: SupabaseClient,
  input:
    | {
        householdId: string;
        accountId: string;
        type: "expense";
        categoryId: string;
        amountCents: number;
        description: string;
        frequency: Frequency;
        nextDueDate: string;
      }
    | {
        householdId: string;
        accountId: string;
        type: "income";
        categoryId: string;
        amountCents: number;
        description: string;
        frequency: Frequency;
        nextDueDate: string;
      }
    | {
        householdId: string;
        accountId: string;
        type: "transfer";
        toAccountId: string;
        amountCents: number;
        description: string;
        frequency: Frequency;
        nextDueDate: string;
      },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("finance")
    .from("recurring_transactions")
    .insert({
      household_id: input.householdId,
      account_id: input.accountId,
      type: input.type,
      category_id: input.type === "expense" || input.type === "income" ? input.categoryId : null,
      to_account_id: input.type === "transfer" ? input.toAccountId : null,
      amount_cents: input.amountCents,
      description: input.description,
      frequency: input.frequency,
      next_due_date: input.nextDueDate,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "insert failed" };
  }

  return { id: data.id as string, error: null };
}

/** RLS-guarded update of the editable definition fields (not the cursor — that only advances
 *  through the confirm/discard seam or a pause/resume transition). `categoryId`/`toAccountId`
 *  are mutually exclusive per the DB shape CHECKs; passing both is a caller error the DB will
 *  reject, not something this function reconciles. */
export async function updateRecurringDefinition(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
  patch: {
    accountId?: string;
    type?: RecurringType;
    categoryId?: string | null;
    toAccountId?: string | null;
    amountCents?: number;
    description?: string;
    frequency?: Frequency;
  },
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = {};
  if (patch.accountId !== undefined) update.account_id = patch.accountId;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.toAccountId !== undefined) update.to_account_id = patch.toAccountId;
  if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.frequency !== undefined) update.frequency = patch.frequency;

  const { error } = await supabase
    .schema("finance")
    .from("recurring_transactions")
    .update(update)
    .eq("id", id)
    .eq("household_id", householdId);

  return { error: error?.message ?? null };
}

/**
 * Pause (`active = false`) freezes the definition — `next_due_date` is left untouched. Resume
 * (`active = true`) MUST pass a `nextDueDate` recomputed via `domain/recurring.ts`'s
 * `nextFutureDueDate` BEFORE calling this — the repository never computes dates itself, matching
 * `budget-repository.ts`'s "no domain logic in the data layer" shape.
 */
export async function setRecurringActive(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
  active: boolean,
  nextDueDate?: string,
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = { active };
  if (active && nextDueDate) {
    update.next_due_date = nextDueDate;
  }

  const { error } = await supabase
    .schema("finance")
    .from("recurring_transactions")
    .update(update)
    .eq("id", id)
    .eq("household_id", householdId);

  return { error: error?.message ?? null };
}

/** RLS-guarded hard delete. Already-posted transactions keep their history; `recurring_id`
 *  becomes NULL on them via the `on delete set null` FK — never blocked, never cascaded. */
export async function deleteRecurringDefinition(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .schema("finance")
    .from("recurring_transactions")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  return { error: error?.message ?? null };
}
