# Proposal: Health Tracking

## Intent

Health spending (studies, consultations, medications, vaccines) is untracked and invisible in Finance today, and health facts (vitals trend, allergies, blood type) live nowhere. Users cannot answer "what did health cost us this year" or surface an allergy at a clinic. Health data is also more sensitive than Finance's household-shared default, so it needs per-record privacy from day one rather than retrofitted.

## Scope

### In Scope

- New `health` module + `health.*` schema (`domain/`, `data/`, `ui/`, `api/`) mirroring `finance/`'s shape.
- **Costed events** posting to Finance via `finance/api` with `origin_module = 'health'`: medical studies/exams, consultations, medications/treatments, vaccines.
- **Non-costed tracking**: periodic vital metrics (weight, BP, glucose) as a time series; conditions/allergies/blood type as static profile reference data (not date-stamped events).
- **Per-event recurrence**, chosen at creation: unbounded (ongoing chronic medication, periodic follow-up) AND bounded/finite-count (10-day antibiotic course, 3-dose vaccine series). Both reuse `finance.recurring_transactions` — the bounded variant reuses the installment columns/cursor shipped in `20260804090030_finance_installment_recurring.sql`. No second recurrence engine.
- **Per-record privacy**: `visibility household | private`, mirroring `finance.accounts.visibility`, enforced in RLS.
- Finance seam widening: DROP + re-ADD `transactions_origin_module_check` to include `health`; widen `OriginModule` + `OriginRefSchema.module` in `src/modules/finance/api/index.ts`.

### Out of Scope

- **Nutrition** (nutritionist consultations) — immediate follow-on change on this same `health.*` foundation. Schema must not foreclose it: the event-type discriminator stays generic and extensible.
- **Recipes** — separate later change; depends on an unbuilt ShoppingList module.
- New Finance RPCs. Health calls the existing seam; Finance grows no health awareness.
- Cross-household or clinician sharing; document/lab-PDF attachments; reminders/notifications.

## Capabilities

### New Capabilities
- `health-events`: costed health events (study, consultation, medication, vaccine), one-off and recurring, posting to Finance.
- `health-vitals`: periodic vital metric capture and trend reading, no cost.
- `health-profile`: static reference record — allergies, chronic conditions, blood type.
- `health-privacy`: per-record `household | private` visibility and its RLS model.

### Modified Capabilities
- `finance-module-api`: `Origin Module Domain` widened to include `health` (same delta shape as the `recurring` precedent).
- `module-architecture`: dependency direction for module→module `api` imports, if design chooses the direct-call shape.

## Approach

One `health` schema owning its own tables and RLS; Finance stays the single ledger. Health writes cost through `finance/api` (`recordTransaction` / `findByOrigin` / `updateOriginTransaction` / `voidTransaction`) with `origin = { module: 'health', entityId }` + an idempotency key — the same shape `finance-recurring` established, and the reason the seam already requires `idempotencyKey` for non-manual origins.

Recurring costed health events create a `finance.recurring_transactions` definition rather than a health-owned scheduler, inheriting confirm/discard/pause/resume for free. Bounded courses map onto the installment cursor semantics (`installments_remaining`, auto-deactivate at zero) already proven for "compra a meses".

Privacy inverts Finance's assumption: `private` is a first-class, commonly-chosen value here, not an edge case. RLS must make a `private` record invisible to other household members across every read path, including any Finance-side surface that could leak it back.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | `create schema health`, tables, RLS, household scoping; DROP+ADD `origin_module` CHECK |
| `src/modules/finance/api/index.ts` | Modified | `OriginModule` + `OriginRefSchema.module` add `health` |
| `src/modules/health/**` | New | `domain/`, `data/`, `ui/`, `api/` |
| `src/app/(app)/salud/**` | New | Routes and Server Actions |
| `eslint.config.mjs` | Modified (likely) | Scoped rule if Health's own layers import `finance/api` |
| `openspec/specs/finance-module-api/spec.md` | Modified | Origin-module delta |

## Open Questions for `sdd-design`

1. **Recurring provenance leak**: `finance.confirm_recurring_transaction` hard-codes `origin_module = 'recurring'` and `origin_entity_id = recurring_id`. A recurring health cost therefore posts as `recurring`, not `health` — breaking `findByOrigin` traceability back to the health event. Resolve: accept the indirection (health event → recurring definition → transaction), add a nullable provenance column, or widen the RPC. **Load-bearing; blocks the seam contract.**
2. **Polymorphic vs per-type tables**: one `health.events` table with a type discriminator, or one table per event type. Affects `origin_entity_id` stability and Nutrition extensibility.
3. **Post timing**: does a costed event post to Finance immediately on log, or through a confirm step like `confirm_recurring_transaction`?
4. **Module-to-module call shape**: Health `data/` → `finance/api` directly (needs a new ESLint rule) vs. composition in the `app` layer (works today, no rule change).
5. **Private + household ledger**: a `private` health event still posts a household-visible Finance transaction. Does the description get redacted, or does `private` imply the cost posts to a private account only?

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Privacy leak via the Finance transaction a private event creates | High | Open Question 5 must be resolved in design before any migration; explicit RLS test per read path |
| Recurring provenance indirection (OQ1) discovered mid-build | Med | Resolve in design; it changes the seam contract, not just wiring |
| CHECK constraint name differs on the live stack | Low | Re-verify `transactions_origin_module_check` before DROP, per the `finance-recurring` migration's own documented caution |
| Nutrition follow-on forces a schema redesign | Med | Keep the event-type discriminator open/extensible; do not encode a closed medical-only enum |
| Scope creep into attachments/reminders/Recipes | Med | Explicit Out of Scope above |

## Rollback Plan

Additive and reversible. Drop `schema health cascade`; revert the `origin_module` CHECK to `('manual','shopping_list','car_control','recurring')` (safe only while zero `health` rows exist — void/delete them first); revert `src/modules/finance/api/index.ts`, delete `src/modules/health/` and `src/app/(app)/salud/`, revert the ESLint rule. Finance's existing behavior is untouched at every step.

## Dependencies

- Finance seam (`src/modules/finance/api/index.ts`) and `finance.recurring_transactions` including the installment/bounded columns — all shipped.
- `core.households` / `core.household_members` for tenancy — shipped.
- No external dependency. Nutrition and Recipes depend on this, not the reverse.

## Success Criteria

- [ ] A costed health event of each of the four types creates exactly one `finance.transactions` row with `origin_module = 'health'` and a resolvable `origin_entity_id`.
- [ ] A bounded recurring health event auto-deactivates after its final occurrence; an unbounded one does not.
- [ ] A `private` health record is invisible to another household member on every read path, verified by test.
- [ ] Vitals render as a trend; allergies/conditions/blood type render as a profile, neither creating a Finance transaction.
- [ ] `finance/api`'s diff is limited to the two `origin_module` widenings — no new Finance RPCs.
- [ ] Adding a Nutrition event type in the follow-on change requires no `health.*` schema redesign.
