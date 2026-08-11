import type { SupabaseClient } from "@supabase/supabase-js";
import type { VitalMetric } from "../domain/vital";
import type { Visibility } from "../domain/event";

/**
 * Repository for `health.vital_readings` (design.md Schema, migration
 * `20260804090033_health_schema.sql` / `20260804090034_health_security.sql`). Plain RLS-guarded
 * CRUD, same shape as `event-repository.ts`. Spec `health-vitals` "Vital Metrics Never Create a
 * Finance Transaction" — this repository has no path to `finance/api` at all, structurally, not
 * merely by convention.
 */
export type VitalReadingListItem = {
  id: string;
  householdId: string;
  ownerUserId: string;
  metric: VitalMetric;
  valueNumeric: number;
  measuredAt: string;
  notes: string;
  visibility: Visibility;
  eventId: string | null;
};

function mapVitalRow(r: Record<string, unknown>): VitalReadingListItem {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    ownerUserId: r.owner_user_id as string,
    metric: r.metric as VitalMetric,
    valueNumeric: Number(r.value_numeric),
    measuredAt: r.measured_at as string,
    notes: (r.notes as string) ?? "",
    visibility: r.visibility as Visibility,
    eventId: (r.event_id as string | null) ?? null,
  };
}

const VITAL_COLUMNS = "id, household_id, owner_user_id, metric, value_numeric, measured_at, notes, visibility, event_id";

/** A single metric's readings, oldest-first (spec `health-vitals` "Vitals Render as a Trend" —
 *  chronological order suitable for trend display, no client-side reconstruction). Omitting
 *  `metric` returns every reading for the space, newest-first, for a flat history view.
 *  `eventId` scopes to one nutrition visit's linked readings (nutrition-submodule). */
export async function listVitalReadings(
  supabase: SupabaseClient,
  householdId: string,
  metric?: VitalMetric,
  filter?: { eventId?: string },
): Promise<VitalReadingListItem[]> {
  let query = supabase.schema("health").from("vital_readings").select(VITAL_COLUMNS).eq("household_id", householdId);

  if (filter?.eventId) {
    query = query.eq("event_id", filter.eventId);
  }

  if (metric) {
    query = query.eq("metric", metric).order("measured_at", { ascending: true });
  } else {
    query = query.order("measured_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data.map(mapVitalRow);
}

/** RLS-guarded insert. Never posts a `finance.transactions` row (spec `health-vitals`).
 *  `eventId` links the reading to a nutrition visit's `health.events` row (nutrition-submodule);
 *  omitted for standalone `/signos` entries. */
export async function createVitalReading(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    ownerUserId: string;
    metric: VitalMetric;
    valueNumeric: number;
    measuredAt?: string;
    notes?: string;
    visibility?: Visibility;
    eventId?: string;
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("health")
    .from("vital_readings")
    .insert({
      household_id: input.householdId,
      owner_user_id: input.ownerUserId,
      metric: input.metric,
      value_numeric: input.valueNumeric,
      measured_at: input.measuredAt ?? new Date().toISOString(),
      notes: input.notes ?? "",
      visibility: input.visibility ?? "household",
      event_id: input.eventId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "insert failed" };
  }

  return { id: data.id as string, error: null };
}

/** RLS-guarded hard delete — corrects a mis-logged reading. */
export async function deleteVitalReading(supabase: SupabaseClient, householdId: string, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("health").from("vital_readings").delete().eq("id", id).eq("household_id", householdId);

  return { error: error?.message ?? null };
}
