# Tasks: Nutrition Submodule

## TDD Mode Assessment

Project `strict_tdd: false` (critical-logic focus, per `sdd-init/lifeos`). Per design.md's Testing
Strategy table, RED-first is scoped to the genuinely security/money/delete-sensitive surfaces —
not blanket TDD:

- **RED-first**: pgTAP (photo-privacy leak, storage-policy foreign-path rejection, delete
  unlink/cascade semantics), Vitest unit for `assertNutritionEvent` and `buildPhotoPath`,
  integration for the full `deleteNutritionVisitAction` flow.
- **Standard (extend-after)**: RTL component tests (`MetricTrendChart` empty state,
  `VisitForm`/`VisitList` render, "Nutrición" absence from `/salud`) — these assert *what got
  built*, not a pre-existing bug, matching `nutrition-tracking`'s own Phase 3 precedent.

## Review Workload Forecast (re-evaluated against this session's 800-line budget)

design.md's own forecast (`400-line budget risk: High`, three stacked slices ~350+400+200=950
total) was computed against the **generic 400-line default**, not this session's cached 800-line
budget. Re-forecasting against the real number:

| Field | Value |
|-------|-------|
| Estimated total changed lines | ~900–950 (migration+pgTAP ~200, domain/data/api ~150, `/nutricion` route+actions+form+list+detail ~350, `EventForm`/`layout.tsx` nav ~50, chart component+`VitalTrend`+detail wiring+deps ~180) |
| Session review budget | 800 changed lines |
| 800-line budget risk | **Medium** — total scope (~950) exceeds 800 as a single PR, but each of the two proposed work units below individually clears the budget with margin |
| Chained PRs recommended | **Yes — 2 PRs, not design.md's assumed 3** |
| Suggested split | PR1: schema + storage policies + data/domain layer + pgTAP (~350 lines, well under 800). PR2: `/nutricion` route + nav wiring + chart component + `VitalTrend` upgrade + pinned deps + integration test (~600 lines, under 800) |
| Delivery strategy | ask-on-risk |
| Chain strategy | **stacked-to-main recommended, 2-deep** — PR2 imports PR1's `event_id` column, `nutrition-photo-repository.ts`, and `health/api` re-exports; it cannot compile/pass RLS tests without PR1 merged first. Design.md's slice 3 (chart) has no hard dependency on slice 2 (route) and could ship separately, but folding it into PR2 keeps both PRs comfortably under 800 while cutting one review round versus design.md's 3-slice assumption — **flag this regrouping for orchestrator/user confirmation before dispatching `sdd-apply`** |

Decision needed before apply: **Yes** — confirm 2-PR stacked grouping (not design.md's literal
3-slice split) before `sdd-apply` begins.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|------------------|--------------------|
| 1 | Migration + storage policies + `config.toml` + domain/data layer + api barrel + pgTAP 140 (design.md slice 1) | PR 1 | `docker exec supabase_db_LIFE_OS psql -U postgres -f supabase/tests/140_nutrition_visits.sql` · `pnpm vitest run tests/unit/nutrition-photo-repository.test.ts tests/unit/health-domain.test.ts` | Local Supabase stack (`supabase start`) | Drop `nutrition_visit_photos`, drop `event_id` column, delete bucket; revert migration + data-layer files |
| 2 | `/nutricion` route + nav + `EventForm` removal + chart component + `VitalTrend` upgrade + pinned deps (design.md slices 2+3, regrouped) | PR 2 (stacked on PR 1) | `pnpm vitest run tests/unit/assert-nutrition-event.test.ts tests/integration/nutrition-visit-delete.test.ts tests/unit/metric-trend-chart-render.test.tsx tests/unit/visit-form-render.test.tsx tests/unit/health-event-form-render.test.tsx` | N/A — unit/RTL/integration against local Supabase, no browser harness | Revert all `/nutricion` files, `layout.tsx` nav change, `EventForm.tsx` change, `VitalTrend.tsx` change, chart component, and `package.json` dep bump independently of PR 1's schema |

## Phase 1: Database Migration (RED → GREEN)

- [x] 1.1 [RED] Write `supabase/tests/140_nutrition_visits.sql` (mirror `120_health_rls.sql` / `130_nutrition_tracking.sql` fixture/impersonation shape): assert (a) a household member CANNOT `select` another member's `nutrition_visit_photos` row even when the linked event is `visibility='household'`; (b) a foreign `(storage.foldername(name))[1]` is rejected by the object policy; (c) deleting a `health.events` row with linked `vital_readings` sets `event_id` to null on those readings (not delete); (d) deleting a `health.events` row with linked `nutrition_visit_photos` cascades (rows gone); (e) `storage.buckets.public = false` for `health-nutrition-photos`. Run pre-migration — all assertions MUST fail (RED evidence). — *spec: `health-privacy` "Nutrition Visit Photos Are Always Owner-Private"; `health-events` "Editing or Deleting a Health Event Follows the Source"*
- [x] 1.2 [GREEN] Create `supabase/migrations/<ts>_health_nutrition_visits.sql` per design.md Migration section: `event_id` FK + partial index on `vital_readings`, `nutrition_visit_photos` table + index, RLS enable + 3 policies (owner-only select, per Decision 1), grants, bucket insert, storage object policies (select/insert/delete scoped to `(storage.foldername(name))[1] = auth.uid()`). — *spec: `health-nutrition-visits` "A Visit Is a Composed Record"; `health-vitals` "A Vital Reading May Carry an Optional Visit Link"*
- [x] 1.3 Add the `health-nutrition-photos` bucket block to `supabase/config.toml`'s commented `[storage.buckets.*]` section (`public = false`, `file_size_limit = "10MiB"`, `allowed_mime_types = ["image/jpeg","image/png","image/webp"]`). [depends: 1.2]
- [x] 1.4 Apply migration locally (`supabase db reset` or targeted apply); re-run 140 — all assertions PASS (GREEN). [depends: 1.2, 1.3]
- [x] 1.5 Confirm the existing `120_health_rls.sql` and `130_nutrition_tracking.sql` suites still pass unchanged (no regression on the household-or-owner pattern for other tables). [depends: 1.4]

## Phase 2: Domain + Data Layer (depends: Phase 1 for full RLS parity, not for compilation)

- [x] 2.1 `src/modules/health/domain/vital.ts`: add optional `eventId?: string` to `VitalEntry` (or the reading shape used by the repository); update the file's header comment to note the visit-link addition. — *spec: `health-vitals` "A Vital Reading May Carry an Optional Visit Link"*
- [x] 2.2 `src/modules/health/data/vital-repository.ts`: accept/return `event_id` on create/read; extend `listVitalReadings` to accept an optional `{ eventId }` filter. [depends: 2.1] — *spec: `health-vitals`, same requirement*
- [x] 2.3 [RED] Write `tests/unit/nutrition-photo-repository.test.ts`: `buildPhotoPath(ownerUserId, eventId, ext)` returns a path prefixed `{ownerUserId}/{eventId}/`; a mismatched/foreign owner id is never accepted implicitly (pure function, assert exact shape). Run before 2.4 exists — MUST fail (module not found / RED). — *spec: `health-privacy` "A direct signed-URL request for another member's photo is denied"*
- [x] 2.4 [GREEN] Create `src/modules/health/data/nutrition-photo-repository.ts`: `NUTRITION_PHOTO_BUCKET`, `buildPhotoPath`, `listVisitPhotos`, `insertPhoto`, `deletePhoto`, `removeObjects`, `createPhotoSignedUrl` (server-side only, per Interfaces/Contracts). [depends: 2.3] Re-run 2.3 — GREEN.
- [x] 2.5 Extend `tests/unit/health-domain.test.ts` (or new file) with `eventId` round-trip assertions for the reading shape. [depends: 2.1, 2.2] (standard mode, not RED-first — additive field, no prior bug)

## Phase 3: API Barrel (depends: Phase 2)

- [x] 3.1 `src/modules/health/api/index.ts`: re-export `nutrition-photo-repository.ts`'s public functions and the updated `vital-repository.ts` signatures (Gate A boundary — app layer must not import `data/` directly). [depends: 2.2, 2.4] — *verified against eslint.config.mjs per design.md Module Boundary Check*

## Phase 4: `/nutricion` Route (depends: Phase 3)

- [x] 4.1 [RED] Write `tests/unit/assert-nutrition-event.test.ts`: `assertNutritionEvent()` rejects an event of type `consultation` or `study`; accepts type `nutrition`. Run before `actions.ts` exists — MUST fail (RED). — *spec: `health-nutrition-visits` "`/nutricion` Is the Sole Creation Path for Visits"*
- [x] 4.2 [GREEN] `src/app/(app)/(health)/nutricion/actions.ts`: `assertNutritionEvent` helper (calls `healthApi.getEventById`, rejects unless `eventType === "nutrition"`) plus five actions — `createNutritionVisitAction` (event + first metrics + first photos + Finance post, mirroring `salud/actions.ts`'s Finance seam byte-for-byte), `addVisitMetricsAction`, `addVisitPhotosAction` (enforce 6-photo/JPG-PNG-WebP/10MB limits per-request, reject before any photo stored), `deleteVisitPhotoAction`, `deleteNutritionVisitAction` (Storage objects removed before rows; readings unlinked via FK `on delete set null`; transaction voided via existing `voidTransactionById`, never deleted). [depends: 4.1, 3.1] Re-run 4.1 — GREEN. — *spec: `health-nutrition-visits` "A Visit Is a Composed Record", "Photo Attachment Limits", "A Visit Is Editable After Creation"; `health-events` "Editing or Deleting a Health Event Follows the Source"*
- [x] 4.3 `src/app/(app)/(health)/nutricion/VisitForm.tsx`: client component — event fields (date/provider/cost/notes/visibility), metric grid (reuse `VitalForm`'s metric list), file input capped at 6 files with client-side type/size pre-check mirroring the server limits. [depends: 4.2]
- [x] 4.4 `src/app/(app)/(health)/nutricion/VisitList.tsx`: client rows; legacy zero-metric events render as completable visits, not an error state. [depends: 4.2] — *spec: `health-nutrition-visits` "Legacy Pre-Change Nutrition Events Are Visible as Completable Visits"*
- [x] 4.5 `src/app/(app)/(health)/nutricion/page.tsx`: server list container calling `healthApi` to compose events + reading counts + photo counts, passed to `VisitList`. [depends: 4.4]
- [x] 4.6 `src/app/(app)/(health)/nutricion/[id]/VisitDetail.tsx`: client detail interactions — add-metrics form, add-photos form, delete-photo button, delete-visit button. [depends: 4.2]
- [x] 4.7 `src/app/(app)/(health)/nutricion/[id]/page.tsx`: server detail — `listVisitPhotos` → `createPhotoSignedUrl(300s)` per photo → `<img src>`; `listVitalReadings(eventId)` passed to chart (Phase 7 wires the actual chart component in). [depends: 4.6, 2.4]
- [x] 4.8 Extend `tests/unit/visit-form-render.test.tsx` (new file, RTL, standard mode): metric grid renders, file input present, 6-file cap surfaces client-side. [depends: 4.3]
- [x] 4.9 Extend `tests/unit/visit-list-render.test.tsx` (new file, RTL, standard mode): a legacy zero-metric event renders as a completable row, not an error state. [depends: 4.4]

4.3–4.4 parallel after 4.2; 4.8–4.9 depend only on their own UI task.

## Phase 5: Remove Nutrition From Generic Form + Nav (depends: Phase 4 for full route parity, not for compilation)

- [x] 5.1 `src/app/(app)/(health)/salud/EventForm.tsx`: remove the `Nutrición` option from the type dropdown. — *spec: `health-events` "The generic form no longer offers nutrition"*
- [x] 5.2 `src/app/(app)/(health)/layout.tsx`: replace the direct `/perfil` `Link` with an `OverflowMenu` (Finance's established pattern) containing `Nutrición` (→ `/nutricion`) and `Perfil` (→ `/perfil`); nav stays `salud · Fab · signos · OverflowMenu`. [depends: 4.5] — *design.md Decision 6*
- [x] 5.3 Extend `tests/unit/health-event-form-render.test.tsx` (standard mode, extend-after): assert "Nutrición" is absent from the type dropdown, the other four costed types remain. [depends: 5.1] — *spec: `health-events` "The generic form no longer offers nutrition"*
- [x] 5.4 New/extended `tests/unit/health-layout-nav-render.test.tsx` (standard mode): `OverflowMenu` renders both `Nutrición` and `Perfil` destinations. [depends: 5.2]

## Phase 6: Integration Test — Delete Flow (depends: Phase 4, Phase 1)

- [x] 6.1 [RED] Write `tests/integration/nutrition-visit-delete.test.ts`: seed a visit with linked readings, photos (real Storage objects against local stack), and a posted Finance transaction; call `deleteNutritionVisitAction`; assert readings survive with `event_id = null`, photo rows and Storage objects are gone, and the Finance transaction is voided (not deleted). Run before 4.2's delete action exists, or against a stub — MUST fail (RED). — *spec: `health-events` "Deleting a nutrition visit unlinks its readings instead of deleting them", "Deleting a nutrition visit deletes its photos"*
- [x] 6.2 [GREEN] Confirm against the real `deleteNutritionVisitAction` (4.2) — all assertions pass. [depends: 6.1, 4.2, 1.4]

## Phase 7: Chart Component + `VitalTrend` Upgrade (depends: Phase 4 for detail wiring only; independently buildable earlier)

- [x] 7.1 `package.json`: add `"@tanstack/charts": "0.11.0"` and `"@tanstack/react-charts": "0.11.0"` (exact pins, no caret); install and smoke-test against React 19 before writing the wrapper (design.md Open Question — peer support unverified). [note: if the smoke test surfaces a React 19 incompatibility, STOP and escalate — this is a blocking discovery, not a task to route around silently]
- [x] 7.2 `src/design-system/patterns/MetricTrendChart.tsx`: locally-declared `TrendPoint`/`TrendSeries`/`MetricTrendChartProps` (no module imports, per Decision 5 — `design-system → design-system | shared` only), full-history rendering by default, `emptyLabel` for zero-point series. [depends: 7.1] — *spec: `health-vitals` "Vitals Render as a Trend"*
- [x] 7.3 `src/app/(app)/(health)/signos/VitalTrend.tsx`: replace the flat list with `MetricTrendChart`, mapping domain `VitalMetric` readings into `TrendSeries` at the call site. [depends: 7.2]
- [x] 7.4 Wire `MetricTrendChart` into `nutricion/[id]/page.tsx` (from 4.7), mapping the visit's linked readings into `TrendSeries`. [depends: 7.2, 4.7]
- [x] 7.5 New `tests/unit/metric-trend-chart-render.test.tsx` (RTL, standard mode — not RED-first per design.md Testing Strategy): empty-state renders `emptyLabel` for a zero-point series; a non-empty series renders without throwing. [depends: 7.2]
- [x] 7.6 Extend `tests/unit/vital-trend-render.test.tsx` (or equivalent, standard mode): `/signos` renders the chart component, not a list, for a metric with entries; full-history assertion (no default time-window truncation). [depends: 7.3] — *spec: `health-vitals` "The chart defaults to full history"*

## Phase 8: Spec Reconciliation

- [x] 8.1 Confirm `specs/health-nutrition-visits/spec.md`, `specs/health-events/spec.md`, `specs/health-vitals/spec.md`, `specs/health-privacy/spec.md` match the implemented behavior — no wording drift between the settled delta specs and what shipped (readings unlink vs. photos hard-delete, owner-only photo privacy independent of event visibility, full-history chart default, legacy zero-metric visits). [depends: all prior phases]
- [x] 8.2 Verify all six proposal.md Success Criteria checkboxes are demonstrably true post-apply (one composed-record save, one Finance transaction, "Nutrición" absent from `/salud`, cross-household photo unreachability, real chart on both `/signos` and visit detail, no calculators in the diff). [depends: 8.1]
