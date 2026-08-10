# Tasks: Health Tracking

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1500–1900 (3 migrations + pgTAP ~450; Finance mods ~120; health domain/data/api ~500; UI+route group+hub ~500; vitest/RTL ~300) |
| 400-line budget risk | High (session budget 1000; still exceeds) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user decides before apply) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migrations: origin_module widen, recurring RLS fix, health schema+RLS | PR 1 | `pg_prove supabase/tests/120_health_rls.sql` | Local Supabase stack (`supabase db reset`) | `drop schema health cascade` + revert 2 CHECK/policy migrations |
| 2 | Finance module widening (api, recurring-repo bounded, transaction-repo listByRecurring) | PR 2 | `npx vitest run tests/integration/finance-recurring-subscription.test.ts` | Local Supabase stack | Revert 3 TS files, no schema change |
| 3 | `src/modules/health/{domain,data,api}` scaffold | PR 3 | `npx vitest run tests/unit/health-*.test.ts` | N/A — pure/RLS-client unit tests | Delete `src/modules/health/{domain,data,api}` |
| 4 | `(health)` route group, UI screens, hub card, E2E | PR 4 | `npx vitest run tests/unit/health-*-render.test.tsx` | Playwright against local stack (`npx playwright test health`) | Delete `(health)/**`, revert hub `MODULES` array |

**TDD note**: RED-first for RLS policies (unit 1), the `event_type`/CHECK constraints, and the `recurring_id`-based `findByOrigin`/`listTransactionsByRecurring` lookups (unit 2/3) — these are the change's critical-logic surfaces per `strict_tdd: false` (critical-logic focus). Standard mode (write-then-verify) for UI scaffolding, hub card, and route wiring (unit 4).

**Path deviation note**: design.md's `src/app/(app)/salud/**` is stale — post-`app-module-hub`, module-architecture's "UI-Layer Route-Group Boundary" requires an owned route group. All Health routes below use `src/app/(app)/(health)/salud/**` with a new `(health)/layout.tsx`. Health gets its own nested nav (events/vitals/profile) — same pattern as `(finance)/layout.tsx`.

## Phase 1: Migrations (Foundation)

- [x] 1.1 RED: `supabase/tests/120_health_rls.sql` — assert member B can't read A's private event/vital/fact/transaction/recurring def/`recurring_due`/`account_balances`; assert `origin_module='health'` rejected pre-migration.
- [x] 1.2 `supabase/migrations/20260804090032_finance_health_seam.sql` — DROP+ADD `transactions_origin_module_check` with `'health'`; DROP+CREATE `recurring_transactions_select/update/delete` adding `and finance.can_read_account(account_id)`. (Renumbered from the design's `...031` — that number was claimed by an unrelated in-flight migration, `20260804090031_finance_recurring_subscription.sql`, from a different work stream; this change's migrations start at `...032`.)
- [x] 1.3 `supabase/migrations/20260804090033_health_schema.sql` — `health` schema, `events`/`vital_readings`/`profile_facts` tables, touch triggers, `health.enforce_private_event_account()`. (Renumbered from the design's `...032`, same reason as 1.2.)
- [x] 1.4 `supabase/migrations/20260804090034_health_security.sql` — RLS + policies mirroring `accounts_select`; revoke/grant per `20260804090006`. (Renumbered from the design's `...033`, same reason as 1.2.)
- [x] 1.5 GREEN: ran full `supabase/tests/120_health_rls.sql` (22/22 pass); added CHECK-constraint cases (bad `event_type`, cost all-or-none, `result_summary`/`dosage` per-type guards, `enforce_private_event_account()` reject/accept) to the same file.

## Phase 2: Finance Module Widening

- [x] 2.1 RED: `tests/integration/finance-recurring-subscription.test.ts` (existing) — extend for `listTransactionsByRecurring` and bounded `createRecurringDefinition`. (New `describe` block appended below the pre-existing B8 suite; 2/3 new tests genuinely failed pre-implementation.)
- [x] 2.2 `src/modules/finance/api/index.ts` — `OriginModule` += `"health"`, `OriginRefSchema.module` += `"health"`, re-export `listTransactionsByRecurring`.
- [x] 2.3 `src/modules/finance/data/recurring-repository.ts` — `createRecurringDefinition` optional `bounded?: {totalOccurrences, anchorDate}` → installment_* columns.
- [x] 2.4 `src/modules/finance/data/transaction-repository.ts` — add `listTransactionsByRecurring(supabase, householdId, recurringId)`.
- [x] 2.5 GREEN: vitest passes (6/6 focused, 316/316 full suite counting the boundary-lint isolated re-run); verified no new RPC/SQL seam change (spec-delta criterion) — zero migration files touched this phase.

## Phase 3: Health Module Scaffold

- [x] 3.1 RED: `tests/unit/health-domain.test.ts` — `requiresPrivateAccount`, type/column legality, bounded-occurrence math.
- [x] 3.2 `src/modules/health/domain/{event,vital,profile}.ts` — pure predicates mirroring DB CHECKs.
- [x] 3.3 RED — DEVIATION: `tests/integration/health-events-repository.test.ts` (not `tests/unit/health-repository.test.ts`) — CRUD + RLS privacy round-trip against the real local stack. Does NOT assert "costed event posts via `origin_module='health'`" / "retry idempotent" / "bounded auto-deactivates" — those require the Finance-posting composition Decision 5 places at the `app` Server Action layer (`health/api` cannot import `finance/api`), which is Phase 4 scope. This phase's own critical-logic surface (the `health-privacy` RLS boundary + `events_cost_all_or_none`/private-account trigger) is covered instead.
- [x] 3.4 `src/modules/health/data/{event,vital,profile}-repository.ts`, `data/index.ts` — RLS CRUD, `recurring-repository.ts` shape.
- [x] 3.5 `src/modules/health/api/index.ts` — `server-only` barrel re-exporting `../data` + `../domain`.
- [x] 3.6 GREEN: `tests/unit/health-domain.test.ts` (16/16) + `tests/integration/health-events-repository.test.ts` (7/7) pass. `listTransactionsByRecurring` resolution (Decision 1) is exercised in Phase 2's `tests/integration/finance-health-recurring.test.ts`, not re-tested here.

### Infrastructure fixes discovered during Phase 3 (not anticipated by design.md, applied directly)

- `supabase/config.toml`: `health` was missing from the PostgREST-exposed `schemas` list — every `health.*` call failed with `"Invalid schema: health"` until added. Required a full `supabase stop && supabase start` (the exposed-schema list is baked into the PostgREST container's env at startup, not hot-reloadable via `notify pgrst, 'reload schema'`).
- `supabase/migrations/20260804090035_core_service_role_fixtures.sql`: `service_role` had zero grants on `core` (not even schema `USAGE`) — needed to add a second household member as a test fixture (no invite/join RPC exists in this schema). Minimal, additive grant (`usage` + CRUD on `core.household_members` to `service_role` only); production RLS/business logic is unaffected since `service_role` already bypasses RLS by design and is never exposed to any client.

## Phase 4: UI, Routing, Hub Integration

- [ ] 4.1 `src/modules/health/ui/{EventList,EventForm,VitalTrend,ProfileCard,PrivacyToggle}.tsx`.
- [ ] 4.2 `src/app/(app)/(health)/layout.tsx` — Health's nested nav (events/vitals/profile), same shape as `(finance)/layout.tsx`.
- [ ] 4.3 `src/app/(app)/(health)/salud/{page,actions}.tsx/.ts`, `signos/`, `perfil/` — Server Actions compose `health/api` + `finance/api` (Decision 5, no cross-module import).
- [ ] 4.4 `src/app/(app)/page.tsx` — add `{ href: "/salud", label: "Salud", icon: <HeartPulse/> }` to `MODULES`.
- [ ] 4.5 RTL smoke tests per component (`tests/unit/health-*-render.test.tsx`), following `tests/unit/recurring-list-render.test.tsx` convention.
- [ ] 4.6 Playwright E2E: log each of the 4 costed types, verify `/movimientos` + trend render.
- [ ] 4.7 Update `openspec/specs/{health-events,health-vitals,health-profile,health-privacy,finance-module-api}/spec.md` deltas to `openspec/specs/` on archive (post-apply, not this phase).
