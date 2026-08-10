# Exploration: Nutrition Tracking (follow-on to health-tracking)

## Current State

`health-tracking` (archived at `openspec/changes/archive/2026-08-08-health-tracking/`, specs merged into `openspec/specs/health-events|health-vitals|health-profile|health-privacy/spec.md`) shipped one `health` schema with three tables:

- `health.events` — polymorphic, `event_type CHECK IN ('study','consultation','medication','vaccine')` (`supabase/migrations/20260804090033_health_schema.sql:12`), cost block (amount_cents/account_id/category_id all-or-nothing), typed nullable columns (`provider_name`, `result_summary` study-only, `dosage` medication/vaccine-only), `recurring_transaction_id` FK, `visibility household|private`.
- `health.vital_readings` — `metric CHECK IN ('weight_kg','systolic_bp','diastolic_bp','glucose_mgdl','heart_rate')`, time series, non-costed.
- `health.profile_facts` — `fact_type CHECK IN ('blood_type','allergy','condition')`, current-state reference data, non-costed.

**The "does not foreclose Nutrition" decision is formally recorded, confirmed in four places, not just an inference:**
1. `openspec/changes/health-nutrition-recipes/exploration.md` (pre-health-tracking exploration) recommended "Nutrition as internal sub-concept of Health, not a separate schema/module" — matching the user's own framing "Nutrition is a branch of Health."
2. The archived `health-tracking` `proposal.md`, Out of Scope: "Nutrition (nutritionist consultations) — immediate follow-on change on this same `health.*` foundation. Schema must not foreclose it." Success Criteria: "Adding a Nutrition event type in the follow-on change requires no `health.*` schema redesign."
3. `openspec/specs/health-profile/spec.md` — `Requirement: Profile Structure Does Not Foreclose Nutrition`: the record/event type domain "MUST remain open and extensible... MUST NOT be encoded as a closed, medical-only enumeration."
4. `src/modules/health/domain/event.ts`'s `EVENT_TYPES` doc comment: "Nutrition-domain types land later by extending this list, not by redesigning the shape."

design.md Decision 2 explains why this is cheap: `health.events` is one table + type discriminator + typed nullable columns (mirrors `finance.transactions.subtype`), so "Nutrition adds one CHECK value and at most one column — no redesign."

## Affected Areas

- `supabase/migrations/` — a **new** migration file (the existing `20260804090033_health_schema.sql` is already applied/archived and must not be edited), following the DROP+ADD CHECK pattern already used twice (`origin_module`, now `event_type`). Re-verify the live constraint name against `pg_constraint` before dropping.
- `src/modules/health/domain/event.ts` — `EVENT_TYPES` array/union gains one value; `isValidEventType` needs no logic change.
- `src/app/(app)/(health)/salud/EventForm.tsx` — `EVENT_TYPES` const gains one Select option (same shape as the existing 4); a conditional field block only if a nutrition-specific column is added.
- `src/app/(app)/(health)/salud/actions.ts`, `EventList.tsx`, `EditEventSheet.tsx` — likely need a label-map addition for the new type; exact locations not fully enumerated in this pass — flag for `sdd-design`/`sdd-tasks`.
- `src/app/(app)/(health)/layout.tsx` — 3-tab nav (events/vitals/profile). No new tab needed; Nutrition lives inside the existing `/salud` events tab.
- `openspec/specs/health-events/spec.md` — "Four Costed Event Types" requirement literally says "exactly four" and needs an explicit spec delta in `sdd-spec`, not a silent code-only widening.

## Investigation: new columns needed, or pure event_type widening?

- **Costed consultation** ("pagar la consulta del nutriólogo"): byte-identical shape to the existing `consultation` event type (title, occurred_on, cost block, `provider_name`, notes, visibility). No new columns required.
- **Weight tracking**: `health.vital_readings.metric` already includes `weight_kg` — nutrition-adjacent weight trend is already fully supported, zero schema change.
- **Allergy/dietary restrictions**: `health.profile_facts.fact_type = 'allergy'` already covers food allergies. Non-allergy dietary preferences (vegetarian, gluten-free-by-choice) have no existing fact_type — a real but separate gap if the scope grows.
- **Diet/meal plan, macro tracking, weight-loss goals**: no existing shape covers this. Checked `finance.accounts.savings_goal` (`src/modules/finance/domain/account.ts`) — it is only an account-type label, with no target-amount/progress/deadline columns; there is no reusable goal-tracking pattern anywhere in this codebase to borrow from.

## Approaches

1. **Pure additive event_type widening — zero new tables/routes/nav** (Option A) — add one CHECK value (e.g. `nutrition_consultation`), one `EVENT_TYPES` entry, one Select option, one spec delta.
   - Pros: matches the already-committed scope exactly; ships the motivating example completely; DROP+ADD CHECK is a proven pattern; trivially inside the 400-line PR budget.
   - Cons: doesn't address diet plans/macro tracking/non-allergy restrictions — but nothing recorded asks for those yet.
   - Effort: Low.

1a. **Variant — reuse `consultation` type as-is** (Option A') — log the nutritionist visit as `event_type = 'consultation'` with `provider_name` set, zero schema/code change.
   - Pros: literally zero change.
   - Cons: loses structured type-level filtering/reporting for nutrition spend; no visible "Nutrition" affordance in the UI despite the user asking to track this explicitly.
   - Effort: Trivial.

2. **New event_type PLUS a small nutrition-specific extension** (Option B) — add the new event type AND extend `profile_facts.fact_type` for non-allergy dietary preferences (still additive, same table, new CHECK value only).
   - Pros: closes the dietary-preference gap.
   - Cons: scope creep beyond the stated motivating example unless explicitly requested; true diet-plan/macro tracking has no cheap extension point and would need a real new table — a separate, bigger decision.
   - Effort: Medium (profile_facts only) to High (if diet-plan/macro included).

3. **Defer entirely** (Option C) — wait for a concrete nutrition-specific need beyond "pay the nutritionist."
   - Cons: contradicts three independently recorded prior commitments that treat this as the settled immediate next step.
   - Effort: N/A — not recommended.

## Recommendation

**Option A.** It is the literal, already-committed scope (proposal.md, merged spec, domain code comment all describe exactly this action as the follow-on). It produces a visible, structured "Nutrition" affordance rather than overloading `consultation`+free-text, and it stays inside the zero-new-tables/columns/nav envelope investigation confirmed is sufficient for the motivating example — trivially small, low-risk (DROP+ADD CHECK now proven twice). Diet-plan/macro tracking and non-allergy dietary-preference tracking (Option B's extensions) should NOT be pulled into this change; no reusable goal/plan pattern exists in this codebase, so that would be genuinely new design work, not a small addition.

**Open question for `sdd-propose`**: confirm the exact CHECK value/label wording — `nutrition_consultation` vs. reuse-flavored naming, and whether the Spanish UI label is distinct ("Consulta de nutrición") or folded under "Consulta médica." One-line decision, but it fixes the migration value and spec wording.

## Risks

- `health-events` spec's "Four Costed Event Types" requirement literally says "exactly four" — `sdd-spec` must write a real delta (new/reworded requirement), not leave spec and code out of sync.
- Constraint name for `health.events.event_type`'s CHECK must be re-verified against `pg_constraint` on the live/target stack before DROP, per both prior migrations' documented caution.
- Scope-creep risk: generic "nutrition tracking" framing could expand toward macro/diet-plan tracking mid-build; explicit recommendation is to hold this change to Option A only.
- Not fully verified: exact label-map locations in `EventList.tsx`/`EditEventSheet.tsx`/`actions.ts` for the new type — flag for `sdd-design`/`sdd-tasks` to enumerate via a full grep, not assumed complete here.

## Ready for Proposal

Yes — the module-vs-event-type decision is settled and independently confirmed in three prior artifacts; `sdd-propose` can proceed directly to Option A scope, surfacing only the one small naming/labeling open question above.
