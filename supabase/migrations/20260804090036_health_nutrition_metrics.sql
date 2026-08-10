-- nutrition-tracking (design.md Decisions 1/2/3/4): two independent, additive CHECK widenings on
-- existing `health.*` tables shipped by `health-tracking` — no new tables/columns/routes.
--
-- Constraint names verified against the live local stack before writing this migration
-- (design.md's blocking gate, resolved by the orchestrator directly):
--   select conname from pg_constraint where conrelid = 'health.events'::regclass and contype = 'c';
--     -> confirms events_event_type_check among 8 CHECK constraints on health.events
--   select conname from pg_constraint where conrelid = 'health.vital_readings'::regclass and contype = 'c';
--     -> confirms vital_readings_metric_check (the table's only other CHECK is
--        vital_readings_visibility_check)

-- §1. event_type gains 'nutrition' (design.md Decision 1). Byte-identical shape to
-- 'consultation' — provider_name renders unconditionally, and the allowlist-style
-- events_result_only_study / events_dosage_only_meds CHECKs already exclude any type they don't
-- name, so 'nutrition' inherits "no dosage, no result_summary" with zero extra constraint work.
alter table health.events drop constraint events_event_type_check;
alter table health.events add  constraint events_event_type_check
  check (event_type in ('study', 'consultation', 'medication', 'vaccine', 'nutrition'));

-- §2. vital_readings.metric widens from 5 to 19 values (design.md Decision 4's binding recount:
-- 4 body-composition + 6 skinfolds in mm + 4 circumferences in cm = 14 new values). Body fat and
-- muscle mass each split into a _pct and _kg metric (Decision 2): vital_readings has no
-- visit/session grouping key, only a free measured_at timestamptz, so a percentage-only store
-- could not reliably derive the kg figure by joining to "the weight reading from the same
-- visit" — both numbers are stored as entered, independently retrievable, neither derived nor
-- overwriting the other. No `unit` column added (Decision 3): value_numeric stays
-- undifferentiated because the metric name itself already carries the unit end-to-end
-- (weight_kg -> "Peso (kg)" in METRIC_LABELS is the existing, unchanged precedent) — a separate
-- unit column would be a third source of truth capable of contradicting the metric name.
alter table health.vital_readings drop constraint vital_readings_metric_check;
alter table health.vital_readings add  constraint vital_readings_metric_check
  check (metric in (
    'weight_kg', 'systolic_bp', 'diastolic_bp', 'glucose_mgdl', 'heart_rate',
    'body_fat_pct', 'body_fat_kg', 'muscle_mass_pct', 'muscle_mass_kg',
    'skinfold_biceps_mm', 'skinfold_triceps_mm', 'skinfold_subscapular_mm',
    'skinfold_iliac_crest_mm', 'skinfold_supraspinal_mm', 'skinfold_abdominal_mm',
    'waist_cm', 'hip_cm', 'thigh_cm', 'arm_flexed_cm'
  ));

-- Existing rows all satisfy the wider predicates in both cases, so no validation failure is
-- possible. Forward-only: no backfill of past 'consultation' rows that may have really been
-- nutrition visits — they were logged correctly under the domain that existed at the time.
