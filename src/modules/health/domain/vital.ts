// Pure TypeScript mirror of `health.vital_readings`'s CHECK constraints (design.md Schema,
// migration `20260804090033_health_schema.sql`). Zero Supabase/framework imports.
// `Visibility`/`isValidVisibility` live in `./event` and are re-exported once from
// `domain/index.ts`'s `export * from "./event"` — not re-exported here too, to avoid a
// `export *` ambiguous-name collision across three barrels for the same origin binding.

/** Mirrors `health.vital_readings.metric` CHECK (design.md Schema; spec `health-vitals` "Vital
 *  Entries Form a Time Series"). */
export const VITAL_METRICS = ["weight_kg", "systolic_bp", "diastolic_bp", "glucose_mgdl", "heart_rate"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

export function isValidVitalMetric(value: string): value is VitalMetric {
  return (VITAL_METRICS as readonly string[]).includes(value);
}

export type VitalEntry = { metric: VitalMetric; valueNumeric: number; measuredAt: string };

/** Chronological (ascending) ordering for trend rendering — spec `health-vitals` "Vitals Render
 *  as a Trend": entries must render "in chronological order suitable for trend display", not a
 *  flat list requiring client-side reconstruction. Pure sort, no I/O. */
export function sortForTrend(entries: readonly VitalEntry[]): VitalEntry[] {
  return [...entries].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}
