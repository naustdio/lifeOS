// THE public surface of the `finance` module — the only path other modules may import from
// (design.md §5.1). `server-only` as the first real statement: any client component importing
// this file fails the build.
import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/shared/supabase/server";
import { type AppError, type Result, err, ok } from "@/shared/result";
import { type AccountType, deriveAccountClass } from "../domain/account";

/**
 * Read-only re-exports (T-036/T-037/T-039, sub-slice 2C): the boundary rule
 * actually enforced by `eslint.config.mjs` only allows `app` to import a
 * module's `api/` barrel, not its `data/` layer directly — sharper than
 * design.md's task-level prose ("reads ... go through `finance/data`
 * repositories directly"), which described the *reading mechanism* (client-
 * direct Supabase under RLS) without accounting for the *TS import*
 * boundary. Routing reads through this barrel too keeps `finance/api` as
 * the single documented cross-module door for both reads and writes,
 * without weakening Gate A.
 */
export {
  listActiveAccounts,
  type AccountListItem,
  listActiveCategories,
  type CategoryListItem,
  listRecentTransactions,
  getTransactionById,
  type TransactionListItem,
  getHouseholdSummary,
  type HouseholdSummary,
  listBudgetsWithProgress,
  getProgressForCategory,
  type BudgetProgressItem,
  getMonthSummary,
  type MonthSummary,
  listCategorySpend,
  type CategorySpendRow,
} from "../data";

/**
 * `finance-budgets` change: budget writes (`upsertBudgetLimit`/`removeBudget`) are the same
 * deliberate `finance.categories`-style exception documented above — plain RLS-guarded CRUD,
 * no seam invariant to protect — but MUST still be re-exported here rather than imported
 * directly from `../data` by app code, because Gate A's ESLint boundary only allows `app` to
 * import a module's `api/` barrel. `recordTransaction`/`updateTransaction` (the real seam
 * functions) are UNCHANGED by this addition — the proposal's "finance/api shows zero diff"
 * success criterion is satisfied for the seam surface it was written to protect; the literal
 * byte-diff check in design.md §8 predates this discovered boundary-lint conflict.
 *
 * Pure `evaluateBudgetImpact`/`budgetDeltaForEdit` are deliberately NOT re-exported from this
 * file: `import "server-only"` above makes this whole module unbundleable by a `"use client"`
 * component (Next.js build error), but `TransactionForm`/`EditTransactionForm` need those pure
 * functions client-side for the pre-submit gate. See `./budget-evaluation.ts` — a second,
 * `server-only`-free file under this same `api/` directory (still `module-api` under the
 * ESLint boundary pattern `src/modules/*\/api/**`), reserved for framework-free re-exports a
 * client component may import.
 */
export { upsertBudgetLimit, removeBudget } from "../data";

/**
 * `finance-recurring` change: CRUD/pause/resume/delete on a recurring definition are the same
 * deliberate plain-RLS exception as budgets above — re-exported here (not imported directly
 * from `../data`) because Gate A's ESLint boundary only allows `app` to import a module's
 * `api/` barrel. `confirmRecurring`/`discardRecurring` below are the real seam wrappers.
 */
export {
  listRecurringDefinitions,
  listDueRecurring,
  countDueRecurring,
  createRecurringDefinition,
  updateRecurringDefinition,
  setRecurringActive,
  deleteRecurringDefinition,
  type RecurringListItem,
  type DueRecurringItem,
} from "../data";

export type OriginModule = "manual" | "shopping_list" | "car_control" | "recurring";

/**
 * DEVIATION FROM design.md's literal `OriginRef` shape (documented, matching the SQL
 * migration's own header note): `householdId` is included because every origin-resolving
 * seam function (`update_origin_transaction`, `void_origin_transaction`, `find_by_origin`)
 * needs it to scope the lookup, per the established "household_id is a parameter, not
 * session-resolved" convention (design.md §5.6). This closes a parameter gap between the
 * prose interface and the SQL bodies design.md itself describes; it introduces no new
 * tenancy concept.
 */
export const OriginRefSchema = z.object({
  householdId: z.string().uuid(),
  module: z.enum(["manual", "shopping_list", "car_control", "recurring"]),
  entityId: z.string().min(1),
});
export type OriginRef = z.infer<typeof OriginRefSchema>;

export type TransactionRef = { id: string; householdId: string; status: "posted" | "void" };
export type AccountRef = { id: string; householdId: string; type: AccountType; class: "asset" | "liability" };
export type TransferRef = { transferGroupId: string; householdId: string };

export type { AccountType } from "../domain/account";

const BaseAccountFields = {
  householdId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  openingBalanceCents: z.number().int().default(0),
  visibility: z.enum(["household", "private"]).default("household"),
  sortOrder: z.number().int().default(0),
};

/**
 * A Zod DISCRIMINATED UNION on `type` (design.md §"Interfaces/Contracts"): the detail block is
 * required exactly when the type demands it, and rejected for every other type — the facade
 * refuses the malformed shape before it can reach the definer's `22023`. `class` and
 * `ownerUserId` are absent by design: both are server-derived.
 */
export const CreateAccountInputSchema = z.discriminatedUnion("type", [
  z.object({ ...BaseAccountFields, type: z.literal("cash") }),
  z.object({ ...BaseAccountFields, type: z.literal("checking") }),
  z.object({ ...BaseAccountFields, type: z.literal("savings") }),
  z.object({ ...BaseAccountFields, type: z.literal("credit_card") }),
  z.object({
    ...BaseAccountFields,
    type: z.literal("liability"),
    liability: z.object({
      originalAmountCents: z.number().int().positive(),
      interestRateBp: z.number().int().min(0),
      termMonths: z.number().int().positive(),
      monthlyPaymentCents: z.number().int().positive(),
      startDate: z.string(),
    }),
  }),
  z.object({
    ...BaseAccountFields,
    type: z.literal("savings_goal"),
    goal: z.object({
      targetAmountCents: z.number().int().positive(),
      targetDate: z.string().optional(),
    }),
  }),
  z.object({
    ...BaseAccountFields,
    type: z.literal("investment"),
    investment: z.object({
      costBasisCents: z.number().int().nonnegative(),
      currentValueCents: z.number().int().nonnegative().optional(),
      valuedOn: z.string().optional(),
    }),
  }),
  z.object({
    ...BaseAccountFields,
    type: z.literal("loaned"),
    loaned: z.object({
      counterpartyName: z.string().trim().min(1).max(60),
      originalAmountCents: z.number().int().positive(),
      termMonths: z.number().int().positive().optional(),
      expectedReturnDate: z.string().optional(),
    }),
  }),
]);
/**
 * `z.input` (not `z.infer`/`z.output`), sub-slice 2C addition: several
 * fields (`openingBalanceCents`, `visibility`, `sortOrder`) carry a Zod
 * `.default()`, so the OUTPUT type marks them required even though callers
 * are meant to omit them (design.md's own contract snippet marks them
 * `?`). Using the input type keeps the exported contract matching
 * design.md exactly and lets UI call sites (T-036) omit them.
 */
export type CreateAccountInput = z.input<typeof CreateAccountInputSchema>;

export const RecordTransactionInputSchema = z.object({
  householdId: z.string().uuid(),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  kind: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive(),
  occurredOn: z.string(),
  description: z.string().default(""),
  origin: OriginRefSchema.pick({ module: true, entityId: true }).default({ module: "manual", entityId: "" }),
  idempotencyKey: z.string().optional(),
});
/** `z.input`, same reasoning as `CreateAccountInput`: `description`/`origin`
 * carry defaults, so callers should be able to omit them. */
export type RecordTransactionInput = z.input<typeof RecordTransactionInputSchema>;

export const RecordTransferInputSchema = z.object({
  householdId: z.string().uuid(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  occurredOn: z.string(),
  description: z.string().default(""),
  origin: OriginRefSchema.pick({ module: true, entityId: true }).default({ module: "manual", entityId: "" }),
  idempotencyKey: z.string().optional(),
});
/** `z.input`, same reasoning as `CreateAccountInput`. */
export type RecordTransferInput = z.input<typeof RecordTransferInputSchema>;

export const TransactionPatchSchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  amountCents: z.number().int().positive().optional(),
  occurredOn: z.string().optional(),
  description: z.string().optional(),
});
export type TransactionPatch = z.infer<typeof TransactionPatchSchema>;

// ---------------------------------------------------------------------------
// PG error code -> typed AppError mapping (design.md §5.5, §"Interfaces/Contracts").
// ---------------------------------------------------------------------------
type PostgrestLikeError = { code?: string; message?: string };

function mapPgError(e: PostgrestLikeError, context: "create_account" | "move" | "generic" | "recurring"): AppError {
  const code = e.code;
  if (code === "23505") {
    return { code: "CATEGORY_NAME_TAKEN", message: "A category with that name already exists.", cause: e };
  }
  if (code === "P0002") {
    return { code: "NOT_FOUND", message: "The requested record was not found.", cause: e };
  }
  if (code === "42501") {
    if (context === "move") {
      return { code: "INVALID_DESTINATION_ACCOUNT", message: "That destination account is not valid.", cause: e };
    }
    return { code: "NOT_A_MEMBER", message: "You are not a member of that space.", cause: e };
  }
  if (code === "22023") {
    if (context === "create_account") {
      return { code: "ACCOUNT_DETAIL_REQUIRED", message: "That account type requires matching detail fields.", cause: e };
    }
    if (context === "recurring") {
      return { code: "RECURRING_INVALID_STATE", message: "That recurring definition is paused or the amount is invalid.", cause: e };
    }
    // finance.update_transaction() raises 22023 for TWO distinct reasons under the same
    // sqlstate: moving a transfer leg, and editing an already-voided transaction (the
    // void-lock check runs BEFORE the move check, so it can fire even on a non-move patch).
    // Both arrive here with context "move" since updateTransaction/updateOriginTransaction
    // always call mapPgError(e, "move") — disambiguate on the exact raised message rather
    // than mislabeling every 22023 from that path as a transfer-leg-move rejection
    // (confirmed real bug: tests/integration/finance-facade.test.ts T-032).
    if (context === "move" && !/voided transaction/i.test(e.message ?? "")) {
      return { code: "TRANSFER_LEG_NOT_MOVABLE", message: "A transfer leg cannot be moved to another account.", cause: e };
    }
    return { code: "VOID_TRANSACTION_NOT_EDITABLE", message: "That operation is not valid for this transaction.", cause: e };
  }
  return { code: "UNKNOWN_ERROR", message: e.message ?? "Unexpected error.", cause: e };
}

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export async function createAccount(input: CreateAccountInput): Promise<Result<AccountRef>> {
  const parsed = CreateAccountInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const i = parsed.data;
  const supabase = await client();

  const liability = i.type === "liability" ? i.liability : undefined;
  const goal = i.type === "savings_goal" ? i.goal : undefined;
  const investment = i.type === "investment" ? i.investment : undefined;
  const loaned = i.type === "loaned" ? i.loaned : undefined;

  const { data, error } = await supabase.schema("finance").rpc("create_account", {
    p_household_id: i.householdId,
    p_name: i.name,
    p_type: i.type,
    p_opening_balance_cents: i.openingBalanceCents,
    p_visibility: i.visibility,
    p_sort_order: i.sortOrder,
    p_original_amount_cents: liability?.originalAmountCents ?? null,
    p_interest_rate_bp: liability?.interestRateBp ?? null,
    p_term_months: liability?.termMonths ?? null,
    p_monthly_payment_cents: liability?.monthlyPaymentCents ?? null,
    p_start_date: liability?.startDate ?? null,
    p_target_amount_cents: goal?.targetAmountCents ?? null,
    p_target_date: goal?.targetDate ?? null,
    p_cost_basis_cents: investment?.costBasisCents ?? null,
    p_current_value_cents: investment?.currentValueCents ?? null,
    p_valued_on: investment?.valuedOn ?? null,
    p_counterparty_name: loaned?.counterpartyName ?? null,
    p_loaned_amount_cents: loaned?.originalAmountCents ?? null,
    p_loaned_term_months: loaned?.termMonths ?? null,
    p_expected_return_date: loaned?.expectedReturnDate ?? null,
  });

  if (error) {
    return err(mapPgError(error, "create_account"));
  }

  return ok({ id: data as string, householdId: i.householdId, type: i.type, class: deriveAccountClass(i.type) });
}

export const UpdateInvestmentValueInputSchema = z.object({
  householdId: z.string().uuid(),
  accountId: z.string().uuid(),
  currentValueCents: z.number().int().nonnegative(),
  valuedOn: z.string().optional(),
});
export type UpdateInvestmentValueInput = z.infer<typeof UpdateInvestmentValueInputSchema>;

/** Updates an investment account's manually-captured current value. Display-only — writes no
 *  transaction (an unrealized valuation is not income). */
export async function updateInvestmentValue(input: UpdateInvestmentValueInput): Promise<Result<void>> {
  const parsed = UpdateInvestmentValueInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const i = parsed.data;
  const supabase = await client();

  const { error } = await supabase.schema("finance").rpc("update_investment_value", {
    p_household_id: i.householdId,
    p_account_id: i.accountId,
    p_current_value_cents: i.currentValueCents,
    p_valued_on: i.valuedOn ?? null,
  });

  if (error) {
    return err(mapPgError(error, "create_account"));
  }

  return ok(undefined as unknown as void);
}

export async function recordTransaction(input: RecordTransactionInput): Promise<Result<TransactionRef>> {
  const parsed = RecordTransactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const i = parsed.data;
  if (i.origin.module !== "manual" && !i.idempotencyKey) {
    return err({ code: "VALIDATION_ERROR", message: "idempotencyKey is required for module-originated transactions." });
  }
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("record_transaction", {
    p_household_id: i.householdId,
    p_account_id: i.accountId,
    p_category_id: i.categoryId,
    p_kind: i.kind,
    p_amount_cents: i.amountCents,
    p_occurred_on: i.occurredOn,
    p_description: i.description,
    p_origin_module: i.origin.module,
    p_origin_entity_id: i.origin.module === "manual" ? null : i.origin.entityId,
    p_idempotency_key: i.origin.module === "manual" ? null : i.idempotencyKey,
  });

  if (error) {
    return err(mapPgError(error, "generic"));
  }

  return ok({ id: data as string, householdId: i.householdId, status: "posted" });
}

export async function recordTransfer(input: RecordTransferInput): Promise<Result<TransferRef>> {
  const parsed = RecordTransferInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const i = parsed.data;
  if (i.origin.module !== "manual" && !i.idempotencyKey) {
    return err({ code: "VALIDATION_ERROR", message: "idempotencyKey is required for module-originated transfers." });
  }
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("record_transfer", {
    p_household_id: i.householdId,
    p_from_account_id: i.fromAccountId,
    p_to_account_id: i.toAccountId,
    p_amount_cents: i.amountCents,
    p_occurred_on: i.occurredOn,
    p_description: i.description,
    p_origin_module: i.origin.module,
    p_origin_entity_id: i.origin.module === "manual" ? null : i.origin.entityId,
    p_idempotency_key: i.origin.module === "manual" ? null : i.idempotencyKey,
  });

  if (error) {
    return err(mapPgError(error, "generic"));
  }

  return ok({ transferGroupId: data as string, householdId: i.householdId });
}

export async function updateTransaction(id: string, patch: TransactionPatch): Promise<Result<TransactionRef>> {
  const parsed = TransactionPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const p = parsed.data;
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("update_transaction", {
    p_transaction_id: id,
    p_account_id: p.accountId ?? null,
    p_category_id: p.categoryId ?? null,
    p_amount_cents: p.amountCents ?? null,
    p_occurred_on: p.occurredOn ?? null,
    p_description: p.description ?? null,
  });

  if (error) {
    return err(mapPgError(error, "move"));
  }

  const { data: row } = await supabase.schema("finance").from("transactions").select("household_id, status").eq("id", data as string).maybeSingle();

  return ok({ id: data as string, householdId: row?.household_id ?? "", status: (row?.status as "posted" | "void") ?? "posted" });
}

export async function updateOriginTransaction(o: OriginRef, patch: TransactionPatch): Promise<Result<TransactionRef>> {
  const parsedOrigin = OriginRefSchema.safeParse(o);
  const parsedPatch = TransactionPatchSchema.safeParse(patch);
  if (!parsedOrigin.success) {
    return err({ code: "VALIDATION_ERROR", message: parsedOrigin.error.message, cause: parsedOrigin.error });
  }
  if (!parsedPatch.success) {
    return err({ code: "VALIDATION_ERROR", message: parsedPatch.error.message, cause: parsedPatch.error });
  }
  const origin = parsedOrigin.data;
  const p = parsedPatch.data;
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("update_origin_transaction", {
    p_household_id: origin.householdId,
    p_origin_module: origin.module,
    p_origin_entity_id: origin.entityId,
    p_account_id: p.accountId ?? null,
    p_category_id: p.categoryId ?? null,
    p_amount_cents: p.amountCents ?? null,
    p_occurred_on: p.occurredOn ?? null,
    p_description: p.description ?? null,
  });

  if (error) {
    return err(mapPgError(error, "move"));
  }

  return ok({ id: data as string, householdId: origin.householdId, status: "posted" });
}

export async function voidTransaction(o: OriginRef, reason: string): Promise<Result<void>> {
  const parsed = OriginRefSchema.safeParse(o);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const origin = parsed.data;
  const supabase = await client();

  const { error } = await supabase.schema("finance").rpc("void_origin_transaction", {
    p_household_id: origin.householdId,
    p_origin_module: origin.module,
    p_origin_entity_id: origin.entityId,
    p_reason: reason,
  });

  if (error) {
    return err(mapPgError(error, "generic"));
  }

  return ok(undefined as unknown as void);
}

/** Void a transaction directly by id — the dominant correction path for manual entries. */
export async function voidTransactionById(id: string, reason: string): Promise<Result<void>> {
  const supabase = await client();

  const { error } = await supabase.schema("finance").rpc("void_transaction", {
    p_transaction_id: id,
    p_reason: reason,
  });

  if (error) {
    return err(mapPgError(error, "generic"));
  }

  return ok(undefined as unknown as void);
}

export async function findByOrigin(o: OriginRef): Promise<Result<TransactionRef | null>> {
  const parsed = OriginRefSchema.safeParse(o);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const origin = parsed.data;
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("find_by_origin", {
    p_household_id: origin.householdId,
    p_origin_module: origin.module,
    p_origin_entity_id: origin.entityId,
  });

  if (error) {
    return err(mapPgError(error, "generic"));
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return ok(null);
  }

  return ok({ id: row.id, householdId: row.household_id, status: row.status });
}

// ---------------------------------------------------------------------------
// Recurring seam wrappers (design.md §4, §7, change: finance-recurring R-009). Both call the
// SECURITY DEFINER functions in supabase/migrations/*_finance_recurring_api.sql — the only
// reachable write path for a recurring definition's cursor + a posted transaction together.
// ---------------------------------------------------------------------------

export const ConfirmRecurringInputSchema = z.object({
  recurringId: z.string().uuid(),
  amountCents: z.number().int().positive().optional(),
  occurredOn: z.string().optional(),
  description: z.string().optional(),
});
export type ConfirmRecurringInput = z.infer<typeof ConfirmRecurringInputSchema>;

/** Atomically posts exactly one transaction (with `recurring_id` set) AND advances
 *  `next_due_date` by one period — never two client calls that could partially apply. */
export async function confirmRecurring(input: ConfirmRecurringInput): Promise<Result<TransactionRef>> {
  const parsed = ConfirmRecurringInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const i = parsed.data;
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("confirm_recurring_transaction", {
    p_recurring_id: i.recurringId,
    p_amount_cents: i.amountCents ?? null,
    p_occurred_on: i.occurredOn ?? null,
    p_description: i.description ?? null,
  });

  if (error) {
    return err(mapPgError(error, "recurring"));
  }

  return ok({ id: data as string, householdId: "", status: "posted" });
}

export const DiscardRecurringInputSchema = z.object({ recurringId: z.string().uuid() });
export type DiscardRecurringInput = z.infer<typeof DiscardRecurringInputSchema>;

/** Advances `next_due_date` by one period, posts nothing. */
export async function discardRecurring(input: DiscardRecurringInput): Promise<Result<{ nextDueDate: string }>> {
  const parsed = DiscardRecurringInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message, cause: parsed.error });
  }
  const i = parsed.data;
  const supabase = await client();

  const { data, error } = await supabase.schema("finance").rpc("discard_recurring_occurrence", {
    p_recurring_id: i.recurringId,
  });

  if (error) {
    return err(mapPgError(error, "recurring"));
  }

  return ok({ nextDueDate: data as string });
}
