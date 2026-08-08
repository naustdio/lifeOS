"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  recordInstallmentPurchase,
  recordTransaction,
  recordTransfer,
  updateTransaction,
  voidTransactionById,
  type TransactionPatch,
} from "@/modules/finance/api";
import { pesosToCents } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

export type MovementFormState = {
  error: string | null;
};

const ERROR_COPY: Record<string, string> = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  NOT_FOUND: "No se encontró el movimiento.",
  TRANSFER_LEG_NOT_MOVABLE: "Una transferencia no se puede mover de cuenta; anúlala y regístrala de nuevo.",
  INVALID_DESTINATION_ACCOUNT: "Esa cuenta destino no es válida.",
  VOID_TRANSACTION_NOT_EDITABLE: "Ese movimiento ya fue anulado y no se puede editar.",
  INVALID_SUBTYPE_FOR_TYPE: "Ese sub-tipo no es válido para este movimiento.",
  INSTALLMENT_INVALID_INPUT: "Revisa la cuenta, el número de cuotas o el monto de la compra.",
};

/** "none" (the Select's placeholder option) <-> undefined, the sub-type Select's contract with
 *  `recordTransaction`/`recordTransfer` (change: finance-transaction-subtypes). */
function subtypeFromFormData(formData: FormData): string | undefined {
  const raw = formData.get("subtype");
  return raw === "none" || raw === null ? undefined : String(raw);
}


/** Server Action backing the income/expense entry form (T-037). Positive
 * magnitude in; the seam derives the stored sign from `kind`. */
export async function recordMovementAction(
  _prevState: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const result = await recordTransaction({
    householdId: spaceId,
    accountId: String(formData.get("accountId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    kind: formData.get("kind") === "income" ? "income" : "expense",
    amountCents: pesosToCents(Number(formData.get("amount") ?? 0)),
    occurredOn: String(formData.get("occurredOn") ?? ""),
    description: String(formData.get("description") ?? ""),
    subtype: subtypeFromFormData(formData),
  });

  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/movimientos");
  revalidatePath("/");
  redirect("/movimientos");
}

/** Server Action backing the transfer entry form (T-037). */
export async function recordTransferAction(
  _prevState: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const fromAccountId = String(formData.get("fromAccountId") ?? "");
  const toAccountId = String(formData.get("toAccountId") ?? "");
  if (fromAccountId === toAccountId) {
    return { error: "Elige dos cuentas distintas para la transferencia." };
  }

  const result = await recordTransfer({
    householdId: spaceId,
    fromAccountId,
    toAccountId,
    amountCents: pesosToCents(Number(formData.get("amount") ?? 0)),
    occurredOn: String(formData.get("occurredOn") ?? ""),
    description: String(formData.get("description") ?? ""),
    subtype: subtypeFromFormData(formData),
  });

  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/movimientos");
  revalidatePath("/");
  redirect("/movimientos");
}

/** Server Action backing "Compra a meses": posts all N installments atomically. Fixed number of
 *  installments (2-60), no `origin`/`idempotencyKey` — always a direct user action. */
export async function recordInstallmentPurchaseAction(
  _prevState: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const installmentCount = Number(formData.get("installmentCount") ?? 0);
  if (!Number.isInteger(installmentCount) || installmentCount < 2 || installmentCount > 60) {
    return { error: "El número de cuotas debe ser un entero entre 2 y 60." };
  }

  const result = await recordInstallmentPurchase({
    accountId: String(formData.get("accountId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    totalAmountCents: pesosToCents(Number(formData.get("amount") ?? 0)),
    installmentCount,
    firstInstallmentOn: String(formData.get("occurredOn") ?? ""),
    description: String(formData.get("description") ?? ""),
  });

  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/movimientos");
  revalidatePath("/");
  redirect("/movimientos");
}

/** Server Action for T-038's correction affordance: account/amount/category/
 * date/description edit-in-place. Surfaces TRANSFER_LEG_NOT_MOVABLE so the
 * UI can offer void-and-re-record instead of a dead end (design.md §5.4). */
export async function updateMovementAction(
  _prevState: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const id = String(formData.get("id") ?? "");

  const patch: TransactionPatch = {};
  const accountId = formData.get("accountId");
  const categoryId = formData.get("categoryId");
  const amount = formData.get("amount");
  const occurredOn = formData.get("occurredOn");
  const description = formData.get("description");
  const subtype = formData.get("subtype");
  if (accountId) patch.accountId = String(accountId);
  if (categoryId) patch.categoryId = String(categoryId);
  if (amount) patch.amountCents = pesosToCents(Number(amount));
  if (occurredOn) patch.occurredOn = String(occurredOn);
  if (description !== null) patch.description = String(description);
  // change: finance-transaction-subtypes. The Select always submits something ("none" or a
  // key), so this form's only two reachable states are "set" and "clear" — `undefined`
  // (leave unchanged) is reachable only by a caller that omits the field entirely, which this
  // form never does.
  if (subtype !== null) patch.subtype = subtype === "none" ? null : String(subtype);

  const result = await updateTransaction(id, patch);
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/movimientos");
  revalidatePath("/");
  redirect("/movimientos");
}

/** Void action (T-038): any posted transaction, with a reason. Also the
 * one-tap remedy offered when a transfer leg rejects a move. */
export async function voidMovementAction(
  _prevState: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "Anulado desde la app");

  const result = await voidTransactionById(id, reason);
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/movimientos");
  revalidatePath("/");
  redirect("/movimientos");
}
