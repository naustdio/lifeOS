# Tasks: Nutrition Tracking

## TDD Mode Assessment

Project `strict_tdd: false` (critical-logic focus only). This change is pure additive CHECK-constraint
widening + label plumbing — no new business logic, no auth/security/money-calc path. Unlike
`health-tracking` Phase 1 (RED-first pgTAP proving a real RLS leak), there is no bug here: pre-migration,
new values are *correctly* rejected. Verdict: **RED-first only for the two pgTAP CHECK-constraint
assertions** (1.1→1.2, genuine before/after regression proof, matches repo convention). **Standard
mode** (test alongside/after) for domain constants and UI, since nothing there is "wrong" pre-change.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450–550 |
| Session review budget | 1000 lines (not generic 400 default) |
| 400-line budget risk | Low (relative to the 1000-line session budget; would read Medium against the generic 400 default) |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (not applicable — single PR fits budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration + pgTAP (Phase 1) | PR 1 (single PR) | `docker exec supabase_db_LIFE_OS psql -U postgres -f supabase/tests/130_nutrition_tracking.sql` | Local Supabase stack (`supabase start`) | Revert migration file; down-migration restores original CHECK sets |
| 2 | Domain + UI + Vitest (Phases 2–4) | Same PR | `pnpm vitest run tests/unit/health-domain.test.ts tests/unit/vital-form-render.test.tsx tests/integration/health-event-posting.test.ts` | N/A — pure unit/RTL/integration, no external harness needed | Revert the 5 UI files + 2 domain files independently of the migration |

## Phase 1: Database Migration (RED → GREEN)

- [x] 1.1 [RED] Write `supabase/tests/130_nutrition_tracking.sql` (mirror `120_health_rls.sql` fixture/impersonation shape): assert `'nutrition'` event_type and all 14 new `vital_readings.metric` values are accepted, and a bogus value is rejected (`23514`). Run pre-migration — new-value assertions MUST fail (RED evidence).
- [x] 1.2 [GREEN] Create `supabase/migrations/<ts>_health_nutrition_metrics.sql`: DROP+re-ADD `events_event_type_check` (+`nutrition`) and DROP+re-ADD `vital_readings_metric_check` (+14 metrics), per design.md Migration Sequence.
- [x] 1.3 Apply migration locally; re-run 130 — all assertions PASS (GREEN).
- [x] 1.4 Confirm bogus-value `throws_ok` assertions still fire post-migration (no over-widening).

## Phase 2: Domain Layer (depends: Phase 1 for full pgTAP parity, not for compilation)

- [x] 2.1 `src/modules/health/domain/event.ts` L11: add `"nutrition"`; update L7-10 doc comment "four"→"five".
- [x] 2.2 `src/modules/health/domain/vital.ts` L9: add the 14 new `VITAL_METRICS` entries (exact list in design.md Interfaces/Contracts).
- [x] 2.3 Extend `tests/unit/health-domain.test.ts`: `isValidEventType("nutrition")` true; `isValidVitalMetric` true for each of the 14 new metrics. [depends: 2.1, 2.2]

## Phase 3: UI Layer (depends: Phase 2)

- [x] 3.1 `EventForm.tsx`: add `nutrition → "Nutrición"` after L21.
- [x] 3.2 `EventList.tsx`: add `"nutrition"` union member (L14) + `TYPE_LABELS` entry (L27).
- [x] 3.3 `actions.ts`: add `| "nutrition"` to inline cast union (L55-59).
- [x] 3.4 `VitalForm.tsx`: add 14 `METRICS` entries after L19, Spanish labels each ending in a parenthesised unit (design.md label table).
- [x] 3.5 `VitalTrend.tsx`: import `VitalMetric` from domain for `VitalReading["metric"]` (L12) instead of re-listing; add 14 `METRIC_LABELS` entries (L24); update `EmptyState` copy (L41) to mention composición corporal.
- [x] 3.6 Extend `tests/unit/health-event-form-render.test.tsx`: "Nutrición" option present. [depends: 3.1]
- [x] 3.7 Extend `tests/unit/health-event-list-render.test.tsx`: "Nutrición" label renders for a nutrition event. [depends: 3.2]
- [x] 3.8 New `tests/unit/vital-form-render.test.tsx`: all 19 metric options present, each label ends in a parenthesised unit. [depends: 3.4]

3.1–3.3 parallel; 3.4–3.5 parallel; each test task depends only on its own UI task.

## Phase 4: Integration (depends: Phase 1, 3.3)

- [x] 4.1 Extend `tests/integration/health-event-posting.test.ts`: a `nutrition` event with a cost posts exactly one `finance.transactions` row with `origin_module='health'`.

## Phase 5: Spec Reconciliation

- [x] 5.1 Confirm `specs/health-events/spec.md` matches design.md — verified: five costed types, generic "outside the costed types" wording. No edit needed.
- [x] 5.2 RESOLVED (orchestrator, before apply): `specs/health-vitals/spec.md`'s requirement body reworded from "biceps circumference, triceps circumference... four skinfold measurements" (2+4) to "six skinfold measurements (biceps, triceps, subscapular, iliac crest, supraspinal, abdominal)... four circumference measurements (waist, hip, thigh, contracted arm)" (6+4), matching design.md Decision 4's binding recount and the domain constant list exactly.
