"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  confirmRecurring,
  createRecurringDefinition,
  deleteRecurringDefinition,
  discardRecurring,
  setRecurringActive,
  updateRecurringDefinition,
  validateRecurringShape,
} from "@/modules/finance/api";
import { nextFutureDueDate } from "@/modules/finance/api/recurring-schedule";
import { pesosToCents } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

export type RecurringFormState = {
  error: string | null;
};

const ERROR_COPY: Record<string, string> = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  NOT_FOUND: "No se encontró la recurrente.",
  RECURRING_INVALID_STATE: "Esa recurrente está en pausa o el monto no es válido.",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Server Action backing the create/edit form (R-016). Creating a definition never posts a
 *  transaction (proposal). */
export async function saveRecurringAction(
  _prevState: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const type =
    (String(formData.get("type") ?? "expense") as "expense" | "income" | "transfer") || "expense";
  const categoryId = String(formData.get("categoryId") ?? "");
  const toAccountId = String(formData.get("toAccountId") ?? "");
  const amountCents = pesosToCents(Number(formData.get("amount") ?? 0));
  const description = String(formData.get("description") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly") as
    | "monthly"
    | "weekly"
    | "biweekly"
    | "yearly";
  const nextDueDate = String(formData.get("nextDueDate") ?? "");
  // Subscriptions only make sense for expense-type definitions (income/transfer can never be
  // marked, regardless of what the client posted — change: finance-subscriptions).
  const isSubscription = type === "expense" && formData.get("isSubscription") === "on";

  if (!accountId || !(amountCents > 0) || !nextDueDate) {
    return { error: "Completa cuenta, monto y fecha." };
  }

  const shapeValid = validateRecurringShape({
    type,
    categoryId: type === "expense" || type === "income" ? categoryId || null : null,
    toAccountId: type === "transfer" ? toAccountId || null : null,
    accountId,
  });
  if (!shapeValid) {
    return {
      error:
        type === "transfer"
          ? "Selecciona una tarjeta destino distinta a la cuenta origen."
          : "Completa cuenta, categoría, monto y fecha.",
    };
  }

  if (id) {
    const { error } = await updateRecurringDefinition(supabase, spaceId, id, {
      accountId,
      type,
      categoryId: type === "expense" || type === "income" ? categoryId : null,
      toAccountId: type === "transfer" ? toAccountId : null,
      amountCents,
      description,
      frequency,
      isSubscription,
    });
    if (error) return { error: "No se pudo guardar la recurrente." };
  } else if (type === "transfer") {
    const { error } = await createRecurringDefinition(supabase, {
      householdId: spaceId,
      accountId,
      type: "transfer",
      toAccountId,
      amountCents,
      description,
      frequency,
      nextDueDate,
      isSubscription,
    });
    if (error) return { error: "No se pudo crear la recurrente." };
  } else if (type === "income") {
    const { error } = await createRecurringDefinition(supabase, {
      householdId: spaceId,
      accountId,
      type: "income",
      categoryId,
      amountCents,
      description,
      frequency,
      nextDueDate,
      isSubscription,
    });
    if (error) return { error: "No se pudo crear la recurrente." };
  } else {
    const { error } = await createRecurringDefinition(supabase, {
      householdId: spaceId,
      accountId,
      type: "expense",
      categoryId,
      amountCents,
      description,
      frequency,
      nextDueDate,
      isSubscription,
    });
    if (error) return { error: "No se pudo crear la recurrente." };
  }

  revalidatePath("/recurrentes");
  revalidatePath("/finance");
  return { error: null };
}

/** Pause/resume (R-017/R-019). Resuming recomputes `next_due_date` to the next FUTURE
 *  occurrence via the pure domain function — never surfaces an accrued-overdue backlog. */
export async function setRecurringActiveAction(
  _prevState: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const currentNextDueDate = String(formData.get("currentNextDueDate") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly") as
    | "monthly"
    | "weekly"
    | "biweekly"
    | "yearly";

  const resumedDate = active ? nextFutureDueDate(currentNextDueDate, frequency, today()) : undefined;

  const { error } = await setRecurringActive(supabase, spaceId, id, active, resumedDate);
  if (error) return { error: "No se pudo actualizar la recurrente." };

  revalidatePath("/recurrentes");
  revalidatePath("/finance");
  return { error: null };
}

/** Delete (R-017/R-019): hard-deletes the definition; posted transactions keep their history
 *  with `recurring_id` set to NULL — never blocked. */
export async function deleteRecurringAction(
  _prevState: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const { error } = await deleteRecurringDefinition(supabase, spaceId, id);
  if (error) return { error: "No se pudo eliminar la recurrente." };

  revalidatePath("/recurrentes");
  revalidatePath("/finance");
  return { error: null };
}

/** Confirm (R-018/R-019): atomically posts one transaction AND advances the cursor, through the
 *  seam. Amount/date/description come from the (possibly edited) form values. */
export async function confirmRecurringAction(
  _prevState: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const recurringId = String(formData.get("recurringId") ?? "");
  const amount = formData.get("amount");
  const occurredOn = formData.get("occurredOn");
  const description = formData.get("description");

  const result = await confirmRecurring({
    recurringId,
    amountCents: amount ? pesosToCents(Number(amount)) : undefined,
    occurredOn: occurredOn ? String(occurredOn) : undefined,
    description: description !== null ? String(description) : undefined,
  });

  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/recurrentes");
  revalidatePath("/finance");
  revalidatePath("/movimientos");
  return { error: null };
}

/** Discard (R-018/R-019): advances the cursor, posts nothing. */
export async function discardRecurringAction(
  _prevState: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const recurringId = String(formData.get("recurringId") ?? "");

  const result = await discardRecurring({ recurringId });
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/recurrentes");
  revalidatePath("/finance");
  return { error: null };
}
