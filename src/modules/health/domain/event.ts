// Pure TypeScript mirror of `health.events`'s CHECK constraints and BEFORE INSERT/UPDATE trigger
// (design.md Schema, migration `20260804090033_health_schema.sql`). Zero Supabase/framework
// imports — a defensive client-side UX guard only; the DB remains the sole authority and
// re-validates independently of whatever this module returns (same discipline as
// `finance/domain/recurring.ts`'s `validateRecurringShape`).

/** Mirrors `health.events.event_type` CHECK — the four costed event types (design.md Schema;
 *  spec `health-events` "Four Costed Event Types"). Nutrition-domain types land later by
 *  extending this list, not by redesigning the shape (spec `health-profile` "Profile Structure
 *  Does Not Foreclose Nutrition"). */
export const EVENT_TYPES = ["study", "consultation", "medication", "vaccine"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isValidEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** Mirrors every health table's `visibility` CHECK (design.md Decision 4; spec `health-privacy`
 *  "Per-Record Visibility Choice"). Shared across `event.ts`/`vital.ts`/`profile.ts` — same
 *  cross-file domain import shape already used by `finance/domain/calendar.ts` importing from
 *  `finance/domain/recurring.ts`. */
export const VISIBILITIES = ["household", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export function isValidVisibility(value: string): value is Visibility {
  return (VISIBILITIES as readonly string[]).includes(value);
}

/**
 * Wire-level visibility values for anything under `src/app/(app)/**` (spec `identity/Household
 * Terminology Hidden From UI`, T-017: the literal word "household" must never appear in UI-facing
 * source — `tests/unit/no-household-text.test.ts` statically scans for it, not just rendered
 * text). "shared" is this module's own UI-facing synonym; `toDomainVisibility`/`toWireVisibility`
 * are the ONLY place the translation happens, kept inside `modules/health` (outside the scanned
 * roots) precisely so the `app` layer never has to write the banned word itself.
 */
export type WireVisibility = "shared" | "private";

export function toDomainVisibility(wire: WireVisibility): Visibility {
  return wire === "shared" ? "household" : "private";
}

export function toWireVisibility(visibility: Visibility): WireVisibility {
  return visibility === "household" ? "shared" : "private";
}

export type CostFields = {
  amountCents: number | null;
  accountId: string | null;
  categoryId: string | null;
};

/** Mirrors `events_cost_all_or_none` — `amount_cents`/`account_id`/`category_id` are either all
 *  null (no cost logged) or all present (a costed event). */
export function costFieldsConsistent(fields: CostFields): boolean {
  const allNull = fields.amountCents === null && fields.accountId === null && fields.categoryId === null;
  const allPresent = fields.amountCents !== null && fields.accountId !== null && fields.categoryId !== null;
  return allNull || allPresent;
}

/** Mirrors `events_result_only_study` — `result_summary` is only legal on a `study` event. */
export function resultSummaryAllowed(eventType: EventType): boolean {
  return eventType === "study";
}

/** Mirrors `events_dosage_only_meds` — `dosage` is only legal on `medication`/`vaccine`. */
export function dosageAllowed(eventType: EventType): boolean {
  return eventType === "medication" || eventType === "vaccine";
}

/** Mirrors `events_recurring_needs_cost` — a `recurring_transaction_id` reference requires a
 *  cost (an event can't be "recurring" without something to post). */
export function recurringRequiresCost(recurringTransactionId: string | null, amountCents: number | null): boolean {
  return recurringTransactionId === null || amountCents !== null;
}

export type AccountPrivacyRef = { visibility: Visibility; ownerUserId: string };

/**
 * Mirrors `health.enforce_private_event_account()` (design.md Decision 4.1): when an event is
 * `private` AND carries a funding account, that account MUST itself be `visibility = 'private'`
 * and owned by the same user — otherwise the cost amount/category leaks to every household
 * member through the ordinary `transactions_select` policy on a household account, silently
 * defeating the event's own `private` choice.
 */
export function accountSatisfiesEventPrivacy(
  eventVisibility: Visibility,
  eventOwnerUserId: string,
  accountId: string | null,
  account: AccountPrivacyRef | null,
): boolean {
  if (eventVisibility !== "private" || accountId === null) {
    return true;
  }
  return account !== null && account.visibility === "private" && account.ownerUserId === eventOwnerUserId;
}

/**
 * Bounded-occurrence math (design.md Decision 6): a bounded recurring health series reuses
 * Finance's `installment_*` columns unrenamed. `installments_remaining` decrements by one on
 * every `confirm_recurring_transaction` call and the series auto-deactivates at zero — this pure
 * mirror lets the UI preview "N of TOTAL" / completion state without a round trip.
 */
export function remainingAfterPost(installmentsRemaining: number): number {
  return Math.max(0, installmentsRemaining - 1);
}

export function isBoundedSeriesComplete(installmentsRemaining: number): boolean {
  return installmentsRemaining <= 0;
}

/** "(n/total)" progress label — mirrors `confirm_recurring_transaction`'s own hardcoded
 *  installment description suffix (design.md Decision 6's documented accepted mislabel), so the
 *  UI's own preview matches what the posted transaction description will actually read. */
export function boundedProgressLabel(installmentTotal: number, installmentsRemaining: number): string {
  const postedCount = installmentTotal - installmentsRemaining;
  return `${postedCount}/${installmentTotal}`;
}
