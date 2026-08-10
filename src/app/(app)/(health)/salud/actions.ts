"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHouseholdId } from "@/modules/core/api";
import * as healthApi from "@/modules/health/api";
import { toDomainVisibility, type WireVisibility } from "@/modules/health/api";
import { createRecurringDefinition, findByOrigin, recordTransaction, voidTransactionById } from "@/modules/finance/api";
import { pesosToCents } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

export type HealthEventFormState = {
  error: string | null;
};

const ERROR_COPY: Record<string, string> = {
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
};

/**
 * Server Action backing the event-creation form (design.md Data Flow, Decision 5): composes
 * `health/api` + `finance/api` side by side — neither module imports the other's api barrel,
 * this is the one place they meet, exactly as `recurrentes/actions.ts` already composes
 * `core/api` + `finance/api`.
 *
 * One-off costed event → `health/api.createEvent` then `finance/api.recordTransaction` with
 * `origin: { module: "health", entityId: eventId }` and `idempotencyKey: eventId` (a retry with
 * the same event id is a no-op on the Finance side, per `record_transaction`'s existing
 * idempotency contract — no new logic needed here).
 *
 * Recurring costed event → `health/api.createEvent` then `finance/api.createRecurringDefinition`
 * (bounded or unbounded per the form), then `health/api.updateEvent` to attach the resulting
 * `recurringTransactionId` back onto the event row (this scaffold's `updateEvent` already
 * accepts that field — no separate `attachRecurring` function needed).
 */
export async function createHealthEventAction(
  _prevState: HealthEventFormState,
  formData: FormData,
): Promise<HealthEventFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_COPY.NOT_A_MEMBER };

  const eventType = String(formData.get("eventType") ?? "consultation") as
    | "study"
    | "consultation"
    | "medication"
    | "vaccine";
  const title = String(formData.get("title") ?? "").trim();
  const occurredOn = String(formData.get("occurredOn") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const visibility = toDomainVisibility(String(formData.get("visibility") ?? "shared") as WireVisibility);
  const providerName = String(formData.get("providerName") ?? "") || null;
  const resultSummary = String(formData.get("resultSummary") ?? "") || null;
  const dosage = String(formData.get("dosage") ?? "") || null;

  if (!title || !occurredOn) {
    return { error: "Completa el título y la fecha." };
  }

  const hasCost = formData.get("hasCost") === "on";
  const accountId = hasCost ? String(formData.get("accountId") ?? "") : "";
  const categoryId = hasCost ? String(formData.get("categoryId") ?? "") : "";
  const amountCents = hasCost ? pesosToCents(Number(formData.get("amount") ?? 0)) : null;
  if (hasCost && (!accountId || !categoryId || !(amountCents! > 0))) {
    return { error: "Completa cuenta, categoría y monto del costo." };
  }

  const recurrenceMode = String(formData.get("recurrenceMode") ?? "none") as "none" | "unbounded" | "bounded";
  const frequency = String(formData.get("frequency") ?? "monthly") as "monthly" | "weekly" | "biweekly" | "yearly";
  const totalOccurrences = Number(formData.get("totalOccurrences") ?? 0);
  if (hasCost && recurrenceMode === "bounded" && !(totalOccurrences >= 2 && totalOccurrences <= 60)) {
    return { error: "El número de ocurrencias debe ser entre 2 y 60." };
  }

  const { id: eventId, error: createErr } = await healthApi.createEvent(supabase, {
    householdId: spaceId,
    ownerUserId: user.id,
    eventType,
    title,
    occurredOn,
    notes,
    visibility,
    amountCents: hasCost ? amountCents : null,
    accountId: hasCost ? accountId : null,
    categoryId: hasCost ? categoryId : null,
    providerName,
    resultSummary,
    dosage,
  });
  if (createErr || !eventId) {
    return { error: "No se pudo registrar el evento. " + (createErr ?? "") };
  }

  if (hasCost && recurrenceMode === "none") {
    const result = await recordTransaction({
      householdId: spaceId,
      accountId,
      categoryId,
      kind: "expense",
      amountCents: amountCents!,
      occurredOn,
      description: title,
      origin: { module: "health", entityId: eventId },
      idempotencyKey: eventId,
    });
    if (!result.ok) {
      return { error: ERROR_COPY[result.error.code] ?? "El evento se guardó, pero no se pudo registrar el gasto." };
    }
  } else if (hasCost && (recurrenceMode === "unbounded" || recurrenceMode === "bounded")) {
    const { id: recurringId, error: recurringErr } = await createRecurringDefinition(supabase, {
      householdId: spaceId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: amountCents!,
      description: title,
      frequency,
      nextDueDate: occurredOn,
      bounded: recurrenceMode === "bounded" ? { totalOccurrences, anchorDate: occurredOn } : undefined,
    });
    if (recurringErr || !recurringId) {
      return { error: "El evento se guardó, pero no se pudo crear la recurrencia. " + (recurringErr ?? "") };
    }
    const { error: attachErr } = await healthApi.updateEvent(supabase, spaceId, eventId, {
      recurringTransactionId: recurringId,
    });
    if (attachErr) {
      return { error: "El evento y la recurrencia se crearon, pero no se pudieron vincular." };
    }
  }

  revalidatePath("/salud");
  revalidatePath("/finance");
  revalidatePath("/movimientos");
  return { error: null };
}

/**
 * Deletes a health event and, for a one-off costed event, voids its linked Finance transaction
 * (spec `health-events` "Deleting an event voids its transaction"). A recurring-linked event's
 * `finance.recurring_transactions` definition is intentionally left running — pausing/deleting
 * an entire payment series from an event-delete action is a bigger decision than this action
 * should make silently; the user manages that from Recurrentes directly, same as any other
 * recurring definition (known scoped limitation, not a bug).
 */
export async function deleteHealthEventAction(
  _prevState: HealthEventFormState,
  formData: FormData,
): Promise<HealthEventFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) return { error: ERROR_COPY.NOT_A_MEMBER };

  const id = String(formData.get("id") ?? "");
  const event = await healthApi.getEventById(supabase, spaceId, id);

  if (event && event.amountCents !== null && !event.recurringTransactionId) {
    const found = await findByOrigin({ householdId: spaceId, module: "health", entityId: id });
    if (found.ok && found.value) {
      await voidTransactionById(found.value.id, "Evento de salud eliminado");
    }
  }

  const { error } = await healthApi.deleteEvent(supabase, spaceId, id);
  if (error) return { error: "No se pudo eliminar el evento." };

  revalidatePath("/salud");
  revalidatePath("/finance");
  revalidatePath("/movimientos");
  return { error: null };
}
