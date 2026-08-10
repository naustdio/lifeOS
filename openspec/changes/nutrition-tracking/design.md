# Design: Nutrition Tracking

## Technical Approach

Two independent additive CHECK widenings on existing tables, no new tables/routes/screens. Same DROP + re-ADD mechanism used three times already (`20260804090012`, `20260804090019`, `20260804090032`). Each widening propagates to exactly one domain constant + its UI label maps.

## Architecture Decisions

### Decision 1 — `event_type` value is `nutrition`

**Choice**: `nutrition`. **Rejected**: `nutrition_consultation`, `nutritionist`.
**Rationale**: the existing four (`study`, `consultation`, `medication`, `vaccine`) are single-word *domain* nouns, not visit-shaped compounds. `nutritionist` names the provider, which already has its own column (`provider_name`); `nutrition_consultation` breaks the one-word convention and duplicates `consultation`. Shape is byte-identical to `consultation`: `provider_name` is rendered unconditionally (`EventForm.tsx:112-117`), and `events_result_only_study` / `events_dosage_only_meds` already exclude any type not named in them — so `nutrition` inherits "no dosage, no result_summary" with **zero extra constraint work**.

### Decision 2 — grasa and músculo become TWO metrics each

**Choice**: `body_fat_pct` + `body_fat_kg`, `muscle_mass_pct` + `muscle_mass_kg`.
**Rejected**: percentage only (kg derived as `pct × weight_kg`).
**Rationale**: the derivation is **not actually available in this schema**. `vital_readings` has no visit/session grouping key — only a free `measured_at timestamptz` — so nothing reliably joins a fat-% row to *the weight row from the same visit*. A derived-kg UI would have to guess (nearest weight reading?), which is exactly the kind of silent wrongness a household tracker must not ship. Second reason: the two numbers carry **different clinical signal** — during a cut, fat kg falling while fat % is flat is a real, meaningful pattern that a %-only store erases. Third: the user's own sheet records both at every visit; discarding one loses source fidelity at entry time for no schema benefit. Cost of storing both is one extra row, additive and constraint-free.

### Decision 3 — no `unit` column; the metric name is the unit

**Choice**: keep the single undifferentiated `value_numeric numeric(10,2)`. **Rejected**: adding `unit text`.
**Rationale**: verified against the rendering code, not assumed. `VitalTrend.tsx:59` renders `{reading.valueNumeric}` **raw, with no unit appended**; the unit reaches the user solely through `METRIC_LABELS` (`weight_kg → "Peso (kg)"`). So the unit already lives in exactly two places that cannot drift from each other independently: the metric identifier and its label. A `unit` column would introduce a genuine third source of truth capable of *contradicting* the metric name (`metric='weight_kg', unit='lb'`) — strictly worse. `numeric(10,2)` covers mm (12.40), cm, %, and kg without precision loss.
**Binding follow-on**: every new label MUST carry its unit in parentheses. (Pre-existing `systolic_bp`/`diastolic_bp`/`heart_rate` labels lack units — noted, out of scope.)

### Decision 4 — measurement recount

The proposal and the phase brief both miscount. Exact recount from the sheet: **6 skinfolds in mm** (bíceps and tríceps *are* pliegues — a mm reading on an arm is a skinfold, not a girth) + **4 circumferences in cm**. Not "4 + 4 = 8". Total new values: 4 composition + 6 skinfold + 4 circumference = **14**, taking `VITAL_METRICS` from 5 to 19.

## Interfaces / Contracts

```ts
// src/modules/health/domain/event.ts:11
export const EVENT_TYPES = ["study", "consultation", "medication", "vaccine", "nutrition"] as const;

// src/modules/health/domain/vital.ts:9
export const VITAL_METRICS = [
  "weight_kg", "systolic_bp", "diastolic_bp", "glucose_mgdl", "heart_rate",
  "body_fat_pct", "body_fat_kg", "muscle_mass_pct", "muscle_mass_kg",
  "skinfold_biceps_mm", "skinfold_triceps_mm", "skinfold_subscapular_mm",
  "skinfold_iliac_crest_mm", "skinfold_supraspinal_mm", "skinfold_abdominal_mm",
  "waist_cm", "hip_cm", "thigh_cm", "arm_flexed_cm",
] as const;
```

Spanish labels (identical strings in `VitalForm.tsx` `METRICS` and `VitalTrend.tsx` `METRIC_LABELS`):

| metric | label |
|---|---|
| `body_fat_pct` | Grasa (%) |
| `body_fat_kg` | Grasa (kg) |
| `muscle_mass_pct` | Músculo (%) |
| `muscle_mass_kg` | Músculo (kg) |
| `skinfold_biceps_mm` | Pliegue bíceps (mm) |
| `skinfold_triceps_mm` | Pliegue tríceps (mm) |
| `skinfold_subscapular_mm` | Pliegue subescapular (mm) |
| `skinfold_iliac_crest_mm` | Pliegue cresta ilíaca (mm) |
| `skinfold_supraspinal_mm` | Pliegue supraespinal (mm) |
| `skinfold_abdominal_mm` | Pliegue abdominal (mm) |
| `waist_cm` | Cintura (cm) |
| `hip_cm` | Cadera (cm) |
| `thigh_cm` | Muslo (cm) |
| `arm_flexed_cm` | Brazo contraído (cm) |

Event type label: `nutrition → "Nutrición"` in `EventForm.tsx` `EVENT_TYPES` and `EventList.tsx` `TYPE_LABELS`.

## Migration Sequence

One file, `supabase/migrations/<ts>_health_nutrition_metrics.sql`, both widenings (they share a change and a rollback):

```sql
alter table health.events drop constraint events_event_type_check;
alter table health.events add  constraint events_event_type_check
  check (event_type in ('study','consultation','medication','vaccine','nutrition'));

alter table health.vital_readings drop constraint vital_readings_metric_check;
alter table health.vital_readings add  constraint vital_readings_metric_check
  check (metric in (/* the 19 values above */));
```

> **VERIFIED against the live local stack** (orchestrator ran this directly, resolving the design phase's blocking gate):
> `docker exec supabase_db_LIFE_OS psql -U postgres -c "select conname from pg_constraint where conrelid = 'health.events'::regclass and contype = 'c';"` → confirms `events_event_type_check` among 8 CHECK constraints on `health.events`.
> `docker exec supabase_db_LIFE_OS psql -U postgres -c "select conname from pg_constraint where conrelid = 'health.vital_readings'::regclass and contype = 'c';"` → confirms `vital_readings_metric_check` (the only other constraint being `vital_readings_visibility_check`).
> Both predicted names were correct. `sdd-tasks`/`sdd-apply` may proceed with these exact names; no further verification needed before writing the DROP statements.

Existing rows all satisfy the wider predicates, so no validation failure is possible. Forward-only: no backfill of past `consultation` rows (they were logged correctly under the domain that existed; silently rewriting user history is worse than leaving it).

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<ts>_health_nutrition_metrics.sql` | Create | Both DROP + re-ADD CHECKs |
| `src/modules/health/domain/event.ts` | Modify | +`"nutrition"` in `EVENT_TYPES` (L11); update the doc comment on L7-10 that says "four" |
| `src/modules/health/domain/vital.ts` | Modify | +14 `VITAL_METRICS` entries (L9) |
| `src/app/(app)/(health)/salud/EventForm.tsx` | Modify | +1 `EVENT_TYPES` entry (after L21) |
| `src/app/(app)/(health)/salud/EventList.tsx` | Modify | +1 union member (L14), +1 `TYPE_LABELS` entry (L27) |
| `src/app/(app)/(health)/salud/actions.ts` | Modify | +`\| "nutrition"` in the inline cast union (L55-59) |
| `src/app/(app)/(health)/signos/VitalForm.tsx` | Modify | +14 `METRICS` entries (after L19) |
| `src/app/(app)/(health)/signos/VitalTrend.tsx` | Modify | widen `VitalReading["metric"]` union (L12) — prefer `VitalMetric` imported from the domain over re-listing 19 literals — and +14 `METRIC_LABELS` entries (L24); update the `EmptyState` description (L41) to mention composición corporal |
| `openspec/specs/health-events/spec.md` | Modify | four → five costed types |
| `openspec/specs/health-vitals/spec.md` | Modify | metric domain 5 → 19 |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `isValidEventType("nutrition")`, `isValidVitalMetric` for all 14 | Extend `tests/unit/health-domain.test.ts` |
| Unit (RTL) | "Nutrición" option present; new metric options present and each label ends in a parenthesised unit | Extend `tests/unit/health-event-form-render.test.tsx`, `health-event-list-render.test.tsx`; new `tests/unit/vital-form-render.test.tsx` |
| pgTAP | Both CHECK constraints accept every new value and still reject a bogus value, at the DB layer directly | New `supabase/tests/130_nutrition_tracking.sql`, mirroring `supabase/tests/120_health_rls.sql`'s fixture/impersonation shape (same project, same convention — this repo HAS a pgTAP harness, 24 files under `supabase/tests/`, run via `docker exec ... psql ... -f <file>` against the local stack; `120_health_rls.sql` is this exact change's own predecessor from the health-tracking cycle) |
| Integration | A `nutrition` event with a cost posts exactly one `finance.transactions` row with `origin_module='health'` | Extend `tests/integration/health-event-posting.test.ts` |

**Correction to a factual error in the design agent's own brief-response** (not the orchestrator's brief, which was correct): an earlier draft of this design claimed "this repo has no pgTAP harness" — that is FALSE, verified directly (`ls supabase/tests/*.sql` returns 24 files, including `120_health_rls.sql` from the immediately-prior `health-tracking` cycle). Both DB-layer pgTAP coverage AND app-layer Vitest integration coverage are this project's established, doubled convention for a CHECK-constraint widening — use both, not one instead of the other.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Pure additive schema + label plumbing.

## Migration / Rollout

Single migration, applied locally then remotely. Rollback = revert the app commit + a down migration restoring both original value sets; safe only while zero rows use a new value.

## Open Questions

- [x] Live constraint names — verified against the local stack (see gate above). Resolved.
- [ ] Proposal Q3 — keep the "unrecognized event type is rejected" scenario worded generically ("outside the costed types") so future widenings need no spec edit. Recommended: **yes**, for `sdd-spec` to enact.
