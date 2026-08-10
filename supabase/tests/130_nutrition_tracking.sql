-- pgTAP — nutrition-tracking (design.md Decisions 1/2/4, tasks.md Phase 1).
--
-- RED pass (this file's initial form): `lives_ok` assertions for `event_type = 'nutrition'` and
-- the 14 new body-composition `vital_readings.metric` values are expected to FAIL against the
-- PRE-migration schema (the CHECK constraints still reject these values) — that failure is the
-- RED evidence. After the widening migration lands, the same assertions pass — GREEN. The
-- "still rejects an unrecognized value" `throws_ok` assertions pass in both states unchanged
-- (regression, not RED/GREEN).

begin;
select plan(21);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000130001', 'nutrition-test@example.com', '{"full_name":"Nutrition Test"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000001300aa', 'personal', '00000000-0000-0000-0000-000000130001', '00000000-0000-0000-0000-000000130001')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'owner')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000130001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- event_type = 'nutrition'
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'nutrition', 'Consulta nutriologo', current_date) $$,
  'event_type=nutrition is accepted once the CHECK is widened'
);

select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'bogus_type', 'x', current_date) $$,
  '23514', null,
  'an unrecognized event_type is still rejected after the widening'
);

-- nutrition inherits "no dosage, no result_summary" for free (allowlist CHECKs already exclude
-- any type they do not name) — confirmed here, not just asserted in design.md.
select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on, dosage)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'nutrition', 'x', current_date, '10mg') $$,
  '23514', null,
  'dosage on event_type=nutrition violates events_dosage_only_meds (nutrition inherits the restriction for free)'
);

select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on, result_summary)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'nutrition', 'x', current_date, 'pending') $$,
  '23514', null,
  'result_summary on event_type=nutrition violates events_result_only_study'
);

-- ---------------------------------------------------------------------------
-- vital_readings.metric widening — all 14 new values, individually confirmed accepted.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'body_fat_pct', 23.5) $$,
  'metric=body_fat_pct is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'body_fat_kg', 21.6) $$,
  'metric=body_fat_kg is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'muscle_mass_pct', 39) $$,
  'metric=muscle_mass_pct is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'muscle_mass_kg', 36) $$,
  'metric=muscle_mass_kg is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'skinfold_biceps_mm', 4) $$,
  'metric=skinfold_biceps_mm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'skinfold_triceps_mm', 13) $$,
  'metric=skinfold_triceps_mm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'skinfold_subscapular_mm', 21) $$,
  'metric=skinfold_subscapular_mm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'skinfold_iliac_crest_mm', 38) $$,
  'metric=skinfold_iliac_crest_mm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'skinfold_supraspinal_mm', 20) $$,
  'metric=skinfold_supraspinal_mm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'skinfold_abdominal_mm', 30) $$,
  'metric=skinfold_abdominal_mm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'waist_cm', 95.8) $$,
  'metric=waist_cm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'hip_cm', 106.9) $$,
  'metric=hip_cm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'thigh_cm', 57.5) $$,
  'metric=thigh_cm is accepted once widened'
);
select lives_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'arm_flexed_cm', 34.8) $$,
  'metric=arm_flexed_cm is accepted once widened'
);

select throws_ok(
  $$ insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric)
     values ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'bogus_metric', 1) $$,
  '23514', null,
  'an unrecognized metric is still rejected after the widening'
);

-- Both units for one visit's grasa/musculo are independently stored (design.md Decision 2 — no
-- derivation, no overwrite): insert all four for one "visit" and confirm all four rows exist.
insert into health.vital_readings (household_id, owner_user_id, metric, value_numeric, measured_at)
values
  ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'body_fat_pct', 24.7, '2026-07-30T00:00:00Z'),
  ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'body_fat_kg', 23.9, '2026-07-30T00:00:00Z'),
  ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'muscle_mass_pct', 38.5, '2026-07-30T00:00:00Z'),
  ('00000000-0000-0000-0000-0000001300aa', '00000000-0000-0000-0000-000000130001', 'muscle_mass_kg', 37.4, '2026-07-30T00:00:00Z');

select is(
  (select count(*)::int from health.vital_readings
    where household_id = '00000000-0000-0000-0000-0000001300aa' and measured_at = '2026-07-30T00:00:00Z'),
  4,
  'body fat and muscle mass percentage+kg readings from the same visit are all four independently stored'
);

select is(
  (select value_numeric from health.vital_readings
    where household_id = '00000000-0000-0000-0000-0000001300aa' and metric = 'body_fat_pct' and measured_at = '2026-07-30T00:00:00Z'),
  24.7::numeric,
  'body_fat_pct is retrievable independently of body_fat_kg (neither overwrites the other)'
);

select * from finish();
rollback;
