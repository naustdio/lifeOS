# Proposal: Nutrition Tracking

## Intent

The motivating example for the whole Health module family — "pagar la consulta del nutriólogo" — still has no structured home. A nutritionist visit can only be logged as `consultation` + free text, so nutrition spend cannot be filtered or reported as its own type. `health-tracking` shipped explicitly pre-committed to this follow-on (its Out of Scope and Success Criteria name it; `health-profile/spec.md` requires the type domain stay open; `event.ts`'s `EVENT_TYPES` doc comment says nutrition lands "by extending this list"). This is executing a recorded decision, not a new one.

**Scope revision**: the user shared two real documents from an actual nutritionist consultation — a "Ficha de Seguimiento" (tracking sheet) and a "Menú" (structured weekly meal plan). The tracking sheet measures **13 body-composition metrics per visit** (peso, grasa %/kg, músculo %/kg, bíceps, tríceps, 4 skinfold measurements, cintura, cadera, muslo, brazo contraído), of which `health.vital_readings` today only covers weight. The menu is a genuine recipe/meal-plan structure (5 breakfast/lunch/dinner options with ingredients and portions) — the user correctly identified this as Recipes-module domain, not Nutrition's, and confirmed the sequencing: (1) this change closes the consultation-type gap AND the body-composition metrics gap, (2) a separate, later change builds a minimal Recipes module (content only, no shopping-list generation), (3) a further later change lets Nutrition's meal plans reference Recipe records — the same hub-and-spoke pattern Health already uses with Finance. Only step (1) is this change's scope.

## Scope

### In Scope
- One new `health.events.event_type` CHECK value: `nutrition` (Spanish UI label **"Nutrición"**, a distinct type — not folded under "Consulta médica").
- New migration file using DROP + re-ADD of the `event_type` CHECK.
- `src/modules/health/domain/event.ts` — one new `EVENT_TYPES` entry.
- Label/union plumbing in the three files that hardcode the 4-type list: `EventForm.tsx:19-21`, `EventList.tsx:14,25-27`, `actions.ts:55-59`. (Grep verified: no `EditEventSheet.tsx` references `eventType`.)
- Spec delta reworking `health-events` "Four Costed Event Types".
- **Body-composition metrics**: widen `health.vital_readings.metric` (same DROP+re-ADD CHECK pattern) to cover the user's real tracking sheet — grasa (fat), músculo (muscle), bíceps, tríceps, 4 skinfold sites (subescapular, cresta ilíaca, supraespinal, abdominal), cintura, cadera, muslo, brazo contraído. **Exact metric list/units are a design-phase decision, not fixed here**: the sheet shows grasa and músculo each as TWO numbers (percentage AND kg) — `sdd-design` must decide whether that's two separate `metric` values each (`body_fat_pct`/`body_fat_kg`) or one primary unit per measurement, and confirm units for the 4 skinfold sites (mm) vs. the 3 circumferences (cm) map cleanly onto `vital_readings`' single `value_numeric` column (no unit column exists today — check whether one is needed).
- `src/app/(app)/(health)/signos/VitalForm.tsx`/`VitalTrend.tsx` — label-map additions for the new metrics, same shape as the event-type plumbing above.

### Out of Scope
- The structured menu/meal-plan itself, and any recipe/ingredient data — deferred to a future Recipes module (separate change), per the confirmed sequencing above. Do NOT store menu content as free text inside a Nutrition event either, as a workaround — that would create exactly the duplicated-recipe problem the user flagged.
- Macro tracking, weight-loss goals — no reusable goal/plan pattern exists in this codebase; genuinely new design work, not requested yet.
- Non-allergy dietary-preference `profile_facts` (food allergies already covered by `fact_type='allergy'`).
- New tables, routes, or nav tabs — the metrics expansion widens the EXISTING `vital_readings` table/screen, it does not add a new one.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `health-events`: "Four Costed Event Types" says "exactly four" — must become five, with nutrition named in both scenarios.
- `health-vitals`: "Vital Entries Form a Time Series" (and the metric-domain requirement, if separately named) must widen from 5 to the confirmed body-composition metric set.

## Approach

Two independent, both-additive widenings, same proven mechanism (DROP + re-ADD CHECK) used three times already in this codebase (`origin_module`, and now both `event_type` and `vital_readings.metric`):
1. `event_type` gains `nutrition`, chosen to match the existing single-word convention (`study`, `consultation`, `medication`, `vaccine`) and to map 1:1 to the confirmed label. Shape is byte-identical to `consultation` (title, occurred_on, cost block, `provider_name`, notes, visibility) — no `dosage`, no `result_summary`.
2. `vital_readings.metric` gains the body-composition set from the user's real tracking sheet, exact value list resolved in `sdd-design` per the ambiguity noted above (dual-unit grasa/músculo, mm vs cm units).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New (2 files, or 1 combined) | DROP + re-ADD `event_type` CHECK; DROP + re-ADD `vital_readings.metric` CHECK |
| `src/modules/health/domain/event.ts` | Modified | +1 `EVENT_TYPES` entry |
| `src/modules/health/domain/vital.ts` | Modified | + body-composition `VITAL_METRICS` entries (count TBD in design) |
| `src/app/(app)/(health)/salud/EventForm.tsx` | Modified | +1 Select option |
| `src/app/(app)/(health)/salud/EventList.tsx` | Modified | +1 union member, +1 label |
| `src/app/(app)/(health)/salud/actions.ts` | Modified | +1 union member |
| `src/app/(app)/(health)/signos/VitalForm.tsx` | Modified | + new metric Select options |
| `src/app/(app)/(health)/signos/VitalTrend.tsx` | Modified | + new metric labels |
| `openspec/specs/health-events/spec.md` | Modified | Delta: four → five event types |
| `openspec/specs/health-vitals/spec.md` | Modified | Delta: metric domain widened |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Live CHECK constraint names differ from the archived migration file | Med | `sdd-design`/`sdd-apply` MUST query `pg_constraint` on the live stack before DROP — never assume the name (this project's repeatedly-learned lesson, now relevant to TWO constraints) |
| Spec/code drift if either delta is skipped | Med | Modified Capabilities is a hard contract for `sdd-spec` |
| Dual-unit metrics (grasa %/kg, músculo %/kg) modeled inconsistently | Med | Explicit design-phase decision required, not left implicit — see Approach §2 |
| Scope creep toward the menu/Recipes/macro-tracking mid-build | Med | Out of Scope is explicit; those are separate, later, already-sequenced changes |
| A missed hardcoded type/metric list | Low | Grep enumerated for event types above; `sdd-tasks` re-greps both `"vaccine"` and `"heart_rate"` to confirm |

## Rollback Plan

Revert the app commit and apply down migrations that DROP and re-ADD both CHECKs with their original value sets. Safe only while zero rows use the new values; if any exist they must be reassigned/removed first, or the rollback will fail the constraint.

## Dependencies

- `health-tracking` (archived 2026-08-08) — already shipped.

## Success Criteria

- [ ] A nutritionist consultation logs as type "Nutrición" and posts exactly one `finance.transactions` row with `origin_module='health'`.
- [ ] The new type is filterable/labelled in `/salud` alongside the existing four.
- [ ] Every body-composition metric from the user's real tracking sheet can be logged in `/signos` and renders in its trend list.
- [ ] `health-events` spec no longer claims "exactly four"; `health-vitals` spec reflects the widened metric domain.
- [ ] No new tables, routes, or nav tabs — both widenings extend existing schema/screens. Diff may exceed the single-widening 400-line estimate given two CHECK migrations plus two screens' label-map plumbing; `sdd-tasks` produces the real forecast.

## Proposal question round

Scope was settled by the user (including the metrics-vs-menu split) before this revision; only these remain, all for `sdd-design`:
1. Confirm the enum value `nutrition` (vs. `nutrition_consultation` / `nutritionist`) — fixes migration value and spec wording.
2. Resolve the dual-unit grasa/músculo modeling (two metrics each vs. one primary unit each) and confirm mm/cm skinfold-vs-circumference handling against `vital_readings`' existing single `value_numeric` column.
3. Should the "unrecognized event type is rejected" scenario stay generic ("outside the costed types") so future widenings need no spec edit?
4. Any need to backfill existing `consultation` rows that were really nutrition visits, or is this forward-only?
