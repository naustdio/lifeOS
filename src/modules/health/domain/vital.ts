// Pure TypeScript mirror of `health.vital_readings`'s CHECK constraints (design.md Schema,
// migration `20260804090033_health_schema.sql`). Zero Supabase/framework imports.
// `Visibility`/`isValidVisibility` live in `./event` and are re-exported once from
// `domain/index.ts`'s `export * from "./event"` — not re-exported here too, to avoid a
// `export *` ambiguous-name collision across three barrels for the same origin binding.

/**
 * Mirrors `health.vital_readings.metric` CHECK (design.md Schema; spec `health-vitals` "Vital
 * Entries Form a Time Series" / "Body-Composition Metrics Are Loggable", change:
 * nutrition-tracking). The 14 body-composition values were added from a real nutritionist
 * tracking sheet. `body_fat_pct`/`body_fat_kg` and `muscle_mass_pct`/`muscle_mass_kg` are
 * deliberately separate metrics, not one derived from the other — `vital_readings` has no
 * visit/session grouping key (only a free `measured_at`), so a percentage-only store could not
 * reliably derive the kg figure by joining to "the weight reading from the same visit"; both are
 * stored as entered. No unit column exists or is needed — the metric name itself carries the
 * unit end-to-end (`weight_kg` → "Peso (kg)" in `METRIC_LABELS` is the existing, unchanged
 * precedent every new label here also follows).
 */
export const VITAL_METRICS = [
  "weight_kg",
  "systolic_bp",
  "diastolic_bp",
  "glucose_mgdl",
  "heart_rate",
  "body_fat_pct",
  "body_fat_kg",
  "muscle_mass_pct",
  "muscle_mass_kg",
  "skinfold_biceps_mm",
  "skinfold_triceps_mm",
  "skinfold_subscapular_mm",
  "skinfold_iliac_crest_mm",
  "skinfold_supraspinal_mm",
  "skinfold_abdominal_mm",
  "waist_cm",
  "hip_cm",
  "thigh_cm",
  "arm_flexed_cm",
] as const;
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
