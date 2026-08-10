import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventType, Visibility } from "../domain/event";

/**
 * Repository for `health.events` (design.md Schema, migration `20260804090033_health_schema.sql`
 * / `20260804090034_health_security.sql`). Plain RLS-guarded CRUD in `finance/data`'s established
 * shape (`transaction-repository.ts`/`recurring-repository.ts`): `Number()` every bigint column,
 * degrade to `[]`/`null` on error rather than throwing.
 *
 * This repository ONLY touches `health.events` — it never posts a `finance.transactions` row.
 * Per design.md ("Health `data/` never imports `finance/api`") and the ESLint boundary rule
 * (`module-data` may only import `module-domain` of the same module + `shared`, never another
 * module's `api/`), the Finance-posting composition for a costed event happens one layer up, in
 * the `app` Server Action, calling `health/api` and `finance/api` side by side (design.md
 * Decision 5) — that composition is Phase 4 scope, not this repository's.
 */
export type EventListItem = {
  id: string;
  householdId: string;
  ownerUserId: string;
  eventType: EventType;
  title: string;
  occurredOn: string;
  notes: string;
  visibility: Visibility;
  amountCents: number | null;
  accountId: string | null;
  categoryId: string | null;
  recurringTransactionId: string | null;
  providerName: string | null;
  resultSummary: string | null;
  dosage: string | null;
};

const EVENT_COLUMNS =
  "id, household_id, owner_user_id, event_type, title, occurred_on, notes, visibility, amount_cents, account_id, category_id, recurring_transaction_id, provider_name, result_summary, dosage";

function mapEventRow(r: Record<string, unknown>): EventListItem {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    ownerUserId: r.owner_user_id as string,
    eventType: r.event_type as EventType,
    title: r.title as string,
    occurredOn: r.occurred_on as string,
    notes: (r.notes as string) ?? "",
    visibility: r.visibility as Visibility,
    amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
    accountId: (r.account_id as string | null) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    recurringTransactionId: (r.recurring_transaction_id as string | null) ?? null,
    providerName: (r.provider_name as string | null) ?? null,
    resultSummary: (r.result_summary as string | null) ?? null,
    dosage: (r.dosage as string | null) ?? null,
  };
}

/** All events for the space, newest-first. RLS (`events_select`) already excludes another
 *  member's private events — no client-side filtering needed. */
export async function listEvents(supabase: SupabaseClient, householdId: string): Promise<EventListItem[]> {
  const { data, error } = await supabase
    .schema("health")
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("household_id", householdId)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(mapEventRow);
}

/** A single event by id, scoped to the current space. Returns null when absent, out of scope, or
 *  private to another member — RLS already prevents that read from returning a row. */
export async function getEventById(supabase: SupabaseClient, householdId: string, id: string): Promise<EventListItem | null> {
  const { data, error } = await supabase
    .schema("health")
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return mapEventRow(data);
}

/** RLS-guarded insert. Creating an event never posts a `finance.transactions` row by itself —
 *  see this file's header note. `ownerUserId` is a caller-supplied parameter (not
 *  session-resolved here), matching `finance/data`'s "household_id is a parameter" convention. */
export async function createEvent(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    ownerUserId: string;
    eventType: EventType;
    title: string;
    occurredOn: string;
    notes?: string;
    visibility?: Visibility;
    amountCents?: number | null;
    accountId?: string | null;
    categoryId?: string | null;
    recurringTransactionId?: string | null;
    providerName?: string | null;
    resultSummary?: string | null;
    dosage?: string | null;
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("health")
    .from("events")
    .insert({
      household_id: input.householdId,
      owner_user_id: input.ownerUserId,
      event_type: input.eventType,
      title: input.title,
      occurred_on: input.occurredOn,
      notes: input.notes ?? "",
      visibility: input.visibility ?? "household",
      amount_cents: input.amountCents ?? null,
      account_id: input.accountId ?? null,
      category_id: input.categoryId ?? null,
      recurring_transaction_id: input.recurringTransactionId ?? null,
      provider_name: input.providerName ?? null,
      result_summary: input.resultSummary ?? null,
      dosage: input.dosage ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "insert failed" };
  }

  return { id: data.id as string, error: null };
}

/** RLS-guarded update of the editable event fields. Does not itself update the linked Finance
 *  transaction (spec `health-events` "Editing or Deleting a Health Event Follows the Source") —
 *  that composition happens at the app layer, alongside `finance/api`'s
 *  `updateOriginTransaction`. */
export async function updateEvent(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
  patch: {
    title?: string;
    occurredOn?: string;
    notes?: string;
    visibility?: Visibility;
    amountCents?: number | null;
    accountId?: string | null;
    categoryId?: string | null;
    recurringTransactionId?: string | null;
    providerName?: string | null;
    resultSummary?: string | null;
    dosage?: string | null;
  },
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.occurredOn !== undefined) update.occurred_on = patch.occurredOn;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.visibility !== undefined) update.visibility = patch.visibility;
  if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
  if (patch.accountId !== undefined) update.account_id = patch.accountId;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.recurringTransactionId !== undefined) update.recurring_transaction_id = patch.recurringTransactionId;
  if (patch.providerName !== undefined) update.provider_name = patch.providerName;
  if (patch.resultSummary !== undefined) update.result_summary = patch.resultSummary;
  if (patch.dosage !== undefined) update.dosage = patch.dosage;

  const { error } = await supabase.schema("health").from("events").update(update).eq("id", id).eq("household_id", householdId);

  return { error: error?.message ?? null };
}

/** RLS-guarded hard delete of the health event row. Does not itself void the linked Finance
 *  transaction (spec `health-events` "Deleting an event voids its transaction") — that
 *  composition happens at the app layer, calling `finance/api`'s `voidTransaction`/
 *  `voidTransactionById` alongside this delete. */
export async function deleteEvent(supabase: SupabaseClient, householdId: string, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("health").from("events").delete().eq("id", id).eq("household_id", householdId);

  return { error: error?.message ?? null };
}
