# Archive Report: nutrition-tracking

**Archived**: 2026-08-10
**Status**: Complete, verified, all spec requirements satisfied.

## Summary

The immediate follow-on to `health-tracking` (archived 2026-08-08): adds `nutrition` as a fifth
costed `health.events` type (UI label "Nutrición") and widens `health.vital_readings.metric` from
5 to 19 values to cover body-composition tracking (body fat %/kg, muscle mass %/kg, 6 skinfold
measurements, 4 circumferences). No new tables, routes, or nav tabs — both widenings extend
schema/screens `health-tracking` already shipped.

Grounded in two real documents the user shared mid-cycle from an actual nutritionist consultation
(a tracking sheet and a structured meal plan), which meaningfully expanded this change's scope
from the originally-proposed single `event_type` value to also cover the full body-composition
metric set the tracking sheet actually measures.

## Commits

| Commit | Scope |
|---|---|
| `314f2b4` | Full implementation: migration + pgTAP (RED→GREEN), domain constants, 6 UI files, unit/RTL/integration tests, spec deltas |

## Verification

- `tsc --noEmit`: clean.
- `eslint`: clean on every touched file.
- pgTAP: RED confirmed (15 genuine pre-migration failures — 1 event_type + 14 metrics — via `lives_ok` assertions that correctly failed against the pre-migration CHECK constraints), then GREEN after the migration (21/21 pass), full 25-file suite clean with zero regressions.
- vitest: 359/359 passing (56 files) at final verification, including new `vital-form-render.test.tsx` (all 19 metric options + unit-suffixed labels) and extended `health-event-posting.test.ts` (a nutrition event posts with `origin_module='health'` exactly like any other costed type).
- Production build: clean, `/salud` and `/signos` both render the new type/metrics.

## Scope revision (mid-cycle, user-directed)

The original proposal (pre-PDF) was pure `event_type` widening only — "Option A" from the exploration phase. The user then shared two real documents from an actual nutritionist consultation:
1. A tracking sheet measuring 13 body-composition metrics per visit (of which only weight was previously trackable).
2. A structured weekly meal plan (5 breakfast/lunch/dinner options with ingredients and portions).

The user correctly identified the meal plan as Recipes-module domain (recipe = ingredients + portions), not Nutrition's — confirmed sequencing: (1) this change (consultation type + metrics), (2) a separate future change for a minimal Recipes module (content-only, no shopping-list generation), (3) a further future change letting Nutrition meal plans reference Recipe records, the same hub-and-spoke pattern Health already uses with Finance. Only step (1) shipped in this cycle. The menu/recipe content itself was **not** stored anywhere in this codebase — deliberately, to avoid the duplicated-recipe problem the user flagged.

## Design decisions of note

- **Dual-unit body fat / muscle mass**: `vital_readings` has no visit/session grouping key (only a free `measured_at`), so a percentage-only store could not reliably derive the kg figure from "the weight reading of the same visit." Both `_pct` and `_kg` are stored as entered, independently, neither derived nor overwriting the other — verified against the actual schema, not assumed.
- **No `unit` column added**: verified against `VitalTrend.tsx`'s actual rendering code that the metric name + its label already carry the unit end-to-end (`weight_kg` → "Peso (kg)"); a separate unit column would be a third source of truth capable of contradicting the metric name.
- **Measurement recount correction**: an early design draft miscounted "4 skinfolds + 4 circumferences = 8" — the real sheet has bíceps and tríceps measured in mm (skinfolds, not circumferences), giving 6 skinfolds + 4 circumferences = 10 new anthropometric metrics + 4 body-composition = 14 total, not 12. Caught and corrected before implementation, not after.
- **A factual error in an earlier design draft** — a claim that "this repo has no pgTAP harness" — was caught and corrected by the orchestrator before proceeding (24 files exist under `supabase/tests/`, including `health-tracking`'s own `120_health_rls.sql`). Both DB-layer pgTAP and app-layer Vitest integration coverage were used, per this project's established doubled convention.
- **Constraint names**: predicted as `events_event_type_check` / `vital_readings_metric_check` by the design phase (no shell access in that execution context); verified directly against the live local stack by the orchestrator before writing the migration — both predictions were correct.
- **Spec/design mismatch caught before archive**: the `health-vitals` spec delta as originally written said "biceps circumference, triceps circumference... four skinfold measurements" (2+4), contradicting design.md's binding 6+4 recount and the actual domain constant list. Reworded before merging into the main spec.

## Specs Synced

| Domain | Action |
|---|---|
| `health-events` | Modified — "Four Costed Event Types" renamed/reworded to "Five Costed Event Types", nutrition named in both scenarios |
| `health-vitals` | Modified — new "Body-Composition Metrics Are Loggable" requirement appended |

## Next Recommended

A minimal Recipes module (content-only: recipe with ingredients/portions/instructions, no shopping-list generation) — the next step in the confirmed sequencing, so a future Nutrition meal-plan feature can reference real recipe records instead of storing menu content inline.
