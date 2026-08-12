```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4ae7a04ebb0e9cfb2809f0514dab6215a4f001b0338c8575e86ff1e6c04765c8
verdict: fail
blockers: 1
critical_findings: 1
requirements: 7/10
scenarios: 20/24
test_command: pnpm exec vitest run
test_exit_code: 0
test_output_hash: sha256:9469e29fb93e0e4b0385d2ddad61dcf67c7b5b6805d7f39f4efd7a7aa43cb56c
build_command: pnpm exec next build
build_exit_code: 0
build_output_hash: sha256:36e895842165228fb2a06c9fa9ae3fa15814a3a44f4d0ce69d6de8871705c2fa
```

# Verification Report — nutrition-submodule

**Change**: `nutrition-submodule`
**Mode**: standard verify (project `strict_tdd: false`, critical-logic RED-first per design.md Testing Strategy; orchestrator did not declare STRICT TDD ACTIVE)
**Artifact store**: hybrid
**Artifacts read**: `proposal.md`, `design.md`, `tasks.md`, 4 delta specs (`health-nutrition-visits`, `health-events`, `health-vitals`, `health-privacy`)
**Authoritative spec counts**: 10 requirements, 24 scenarios
**Verified at**: commit `85be645` (last nutrition commit), main repo working tree

---

## Completeness

| Dimension | Result | Detail |
|---|---|---|
| Tasks marked complete | 30/30 checked | Phases 1-8, no unchecked task |
| Tasks match code state | Yes | Every task's named file/test exists on disk and is committed |
| Proposal Success Criteria | 6/6 hold | Re-verified below |
| `apply-progress` artifact | Absent | Implementation performed directly, not by a delegated `sdd-apply` agent. Not a code defect; recorded as WARNING-2. |
| Design dimensions verified | All | proposal + specs + design + tasks all present |

---

## Command Evidence

| Gate | Command | Exit | Evidence |
|---|---|---|---|
| Typecheck | `pnpm exec tsc --noEmit` | 0 | clean, no output |
| Lint | `pnpm exec eslint .` | 0 | clean, no output (includes `boundaries/element-types` Gate A) |
| Unit + integration | `pnpm exec vitest run` | 0 | 66 files, 396 tests passed, 0 failed. `test_output_hash=sha256:9469e29fb93e0e4b0385d2ddad61dcf67c7b5b6805d7f39f4efd7a7aa43cb56c` |
| Build | `pnpm exec next build` | 0 | `/nutricion` and `/nutricion/[id]` present in the route manifest. `build_output_hash=sha256:36e895842165228fb2a06c9fa9ae3fa15814a3a44f4d0ce69d6de8871705c2fa` |
| Design tokens | `node scripts/check-tokens.mjs` | 0 | OK — no raw hex literals outside the tokens directory |
| pgTAP (all 26 files) | `docker exec -i supabase_db_LIFE_OS psql -U postgres -v ON_ERROR_STOP=1 -f -` per file | 0 x 26 | 0 failing assertions across all 26 suites, including `120_health_rls.sql` and `130_nutrition_tracking.sql` (no regression) |
| OpenSpec CLI validate | `pnpm exec openspec validate` | n/a | Skipped — `openspec` binary not installed; not part of the project `verify` script |
| Coverage | — | n/a | Skipped — no coverage tool configured in `vitest.config.ts` |

### Build-gate note (resolved, not a defect)

The first `next build` failed with `TypeError: a[d] is not a function` while prerendering `/entrar`. A clean rebuild after removing `.next` succeeded (exit 0). Root cause was a stale webpack build cache, not this change — `/entrar` is a public auth route untouched by `nutrition-submodule`.

### pgTAP 140_nutrition_visits.sql — 8 assertions, all ok

1. member C DOES see the household-visible nutrition event itself (fixture sanity)
2. member C does NOT see A photo even though the linked event is `visibility=household`
3. owner A still sees her own visit photo
4. member C cannot upload into a folder prefixed with A user id
5. A CAN upload into a folder prefixed with her own user id
6. the `health-nutrition-photos` bucket is private (`public = false`)
7. deleting the linked event nulls `event_id` on its `vital_readings` (the reading survives)
8. deleting the linked event cascades its `nutrition_visit_photos` rows

---

## Spec Compliance Matrix (10 requirements / 24 scenarios)

### health-nutrition-visits (5 req / 8 scenarios)

| Requirement / Scenario | Status | Runtime evidence |
|---|---|---|
| A Visit Is a Composed Record — all three parts saved atomically | PARTIAL | `tests/integration/nutrition-visit-delete.test.ts` invokes the real `createNutritionVisitAction` against the local stack (event + Finance post verified). Metrics and photos in that test are seeded out-of-band, so the form-supplied metric/photo branch of the same submission is not runtime-asserted. See WARNING-1. |
| A Visit Is a Composed Record — metrics-only or photos-only save | PASS | Same integration test creates a visit with neither metrics nor photos and gets no error; `validatePhotoFiles` early-returns on an empty file list |
| /nutricion Is the Sole Creation Path — generic form cannot create a nutrition visit | PASS | `tests/unit/health-event-form-render.test.tsx:83` asserts the Nutricion option is absent; `tests/unit/assert-nutrition-event.test.ts` (4 cases) rejects consultation/study/missing |
| A Visit Photos Are Editable After Creation — a photo is removed from an existing visit | PASS | `deleteVisitPhotoAction` + `healthApi.deletePhoto` (row + object); object removal proven by the integration test `removeObjects` assertion; RLS-guarded by `nutrition_visit_photos_delete` (pgTAP) |
| Photo Attachment Limits — a 7th photo is rejected | PASS | `tests/unit/photo-picker-grid-render.test.tsx` (5 cases incl. warning when more files are selected than room remains); server `validatePhotoFiles(files, existingCount)` counts existing + new |
| Photo Attachment Limits — oversized/wrong-type rejected before any row | PASS (server logic reviewed, client unit-covered) | `actions.ts:71-85` validates every file before `persistPhotos`; bucket `allowed_mime_types` + `file_size_limit = "10MiB"` in `config.toml`; pgTAP asserts the bucket is private |
| Legacy Pre-Change Events — legacy event appears in the visit list | PASS | `tests/unit/visit-list-render.test.tsx:29` renders a legacy zero-metric visit as a completable row, not an error |
| Legacy Pre-Change Events — a legacy visit can be completed | PASS (code) / UNTESTED (runtime) | `VisitDetail.tsx:91` `hasAnyReading` gate renders the completion form only for zero-own-reading visits; `addVisitMetricsAction` writes readings with that `eventId`. No runtime test drives the completion save. See WARNING-3. |

### health-events (2 req / 8 scenarios)

| Requirement / Scenario | Status | Runtime evidence |
|---|---|---|
| Five Costed Event Types — each costed type posts a Finance transaction | PASS | Pre-existing `tests/integration/health-event-posting.test.ts` + `tests/unit/health-domain.test.ts:24`, unchanged and green |
| Five Costed Event Types — nutritionist visit logs and posts under its own type | PASS | Integration test asserts `findByOrigin(...)` status `posted` for a /nutricion-created visit |
| Five Costed Event Types — unrecognized type rejected | PASS | `tests/unit/health-domain.test.ts` type-constraint cases (unchanged) |
| Five Costed Event Types — generic form no longer offers nutrition | PASS | `tests/unit/health-event-form-render.test.tsx:83`; `EventForm.tsx:17-19` documents the removal |
| Editing/Deleting Follows the Source — editing cost updates the transaction | PASS | Pre-existing health-events suites green (seam unchanged) |
| Editing/Deleting — deleting an event voids its transaction | PASS | Integration test: `posted` before, `void` after `deleteNutritionVisitAction` |
| Editing/Deleting — deleting a nutrition visit unlinks its readings | PASS | Integration test asserts `event_id` is null and the reading row survives; pgTAP 140 assertion 7 asserts the same at the DB layer |
| Editing/Deleting — deleting a nutrition visit deletes its photos | PASS | Integration test asserts the photo row is gone AND `storage.list()` returns 0 objects; pgTAP 140 assertion 8 |

### health-vitals (2 req / 5 scenarios)

| Requirement / Scenario | Status | Runtime evidence |
|---|---|---|
| Optional Visit Link — reading linked to the visit that captured it | PASS | Integration test creates a reading with `eventId` and reads it back; `tests/unit/health-domain.test.ts:134` eventId round-trip |
| Optional Visit Link — standalone reading has no visit link | PASS | Column is nullable; `health-domain.test.ts:134` asserts the round-trip does not disturb chronological sort; existing /signos suites green |
| Optional Visit Link — unlinking does not remove it from its time series | PASS | pgTAP 140 assertion 7 (on delete set null, row survives) + integration test |
| Vitals Render as a Trend — weight entries render as a chart | UNTESTED (assertion gap) | No test asserts a chart mark. See CRITICAL-1. |
| Vitals Render as a Trend — chart defaults to full history | UNTESTED (assertion gap) | `vital-trend-render.test.tsx:47` asserts 20 delete buttons (the reading list below the chart), not 20 points on the chart. See CRITICAL-1. |

### health-privacy (1 req / 3 scenarios)

| Requirement / Scenario | Status | Runtime evidence |
|---|---|---|
| Photos Always Owner-Private — a photo on a household-shared visit stays private | PASS | pgTAP 140 assertions 1+2: member C sees the household-visibility event but NOT the photo row |
| Photos Always Owner-Private — direct signed-URL request for another member photo denied | PASS | pgTAP 140 assertion 4 (foreign folder prefix rejected by the object policy) + assertion 6 (bucket private); `createPhotoSignedUrl` is server-side only, re-exported through `health/api` |
| Photos Always Owner-Private — the owner can always view their own photo | PASS | pgTAP 140 assertions 3 + 5 |

Compliance tally: 20 PASS, 1 PARTIAL, 3 UNTESTED/gap (2 from CRITICAL-1, 1 from WARNING-3) of 24 scenarios.

---

## Proposal Success Criteria Re-verification (post fast-follow)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Visit produces one event, N readings with `event_id`, 0..N private photos | Holds, over-cited | True in code and at the DB layer; the cited test does not itself submit metrics/photos through the form (WARNING-1) |
| 2 | Exactly one `finance.transactions` row with `origin_module='health'` | Holds | Integration test: `findByOrigin` returns `posted`, then `void` after delete. Finance seam byte-identical to `salud/actions.ts` |
| 3 | Nutricion absent from the /salud dropdown | Holds | `health-event-form-render.test.tsx:83` green |
| 4 | Photo URL unreachable by a household member of a household-shared visit | Holds — unchanged by fast-follow | Migration `20260811090037_health_nutrition_visits.sql` matches design.md Decision 1 exactly; all 5 fast-follow commits are UI-only (no `supabase/` file touched). pgTAP 140 re-run green. |
| 5 | /signos and visit detail both render a real chart from the shared component | Holds (behaviour) | Both import `MetricTrendChart`; a jsdom probe confirms a real svg with a plotted path `M62.15,9.5L349.15,103.25L608.39,197`. The tests do not assert this — CRITICAL-1 |
| 6 | No calculators anywhere in the diff | Holds — still true after fast-follow | Case-insensitive search for calculator/calculadora/imc/macro/deficit/tdee across `nutricion/`, `modules/health/`, `MetricTrendChart.tsx`, `PhotoPickerGrid.tsx` returned zero hits |

---

## Gate A — Module Boundary Compliance

| Check | Result |
|---|---|
| `pnpm exec eslint .` with `boundaries/element-types` active | exit 0 |
| `@/modules` imports anywhere under `src/design-system/` | 0 hits |
| `PhotoPickerGrid.tsx` imports | `lucide-react`, `react` only |
| `MetricTrendChart.tsx` imports | `react`, `@tanstack/charts`, `@tanstack/charts/tooltip`, `@tanstack/react-charts/tooltip`, `d3-scale`, `@/design-system/ui/card` — all design-system or shared |
| App-layer direct `@/modules/*/data` or `/domain` imports | 0 hits — all go through `@/modules/health/api` |
| `health/api/index.ts` re-exports | `buildPhotoPath`, `listVisitPhotos`, `insertPhoto`, `deletePhoto`, `removeObjects`, `createPhotoSignedUrl` all present |

Gate A: PASS. Neither fast-follow file violates the boundary; `TrendPoint`/`TrendSeries` remain locally declared primitives (design.md Decision 5 upheld).

---

## Design Coherence

| Design decision | Result | Note |
|---|---|---|
| D1 — photos owner-only at row and object layer | PASS | Migration matches the design SQL verbatim, including the comment explaining the deliberate divergence from the household-or-owner house pattern |
| D2 — link validation in one server action | PASS | `assertNutritionEvent` in `nutricion/actions.ts` with injectable `getEventById`, called by `addVisitMetricsAction` and `addVisitPhotosAction`; no DB trigger |
| D3 — distinct add-actions, not a reused create action | PASS | All 5 actions present as specified |
| D4 — unlink metrics, hard-delete photos, void transaction, Storage before rows | PASS | `deleteNutritionVisitAction` voids, then removes objects, then deletes the event row; proven end-to-end by the integration test |
| D5 — chart takes primitive series, no domain types | PASS | See Gate A |
| D6 — health nav mirrors the Finance 4-slot shape | PASS | `tests/unit/health-layout-nav-render.test.tsx` (2 cases) |
| Interfaces/Contracts — `TrendPoint` shape | DEVIATION | Now `{ measuredAt; value; current? }`; design.md still documents the 2-field shape (WARNING-4) |
| File Changes — `package.json` chart deps | DEVIATION | The two @tanstack pins are exact as specified, plus undocumented `d3-scale@4.0.2` and `@types/d3-scale@4.0.9` (WARNING-4) |
| Design Open Question — React 19 peer support unverified | STALE | Still unchecked; resolved in practice (installed, build and 396 tests green) — SUGGESTION-1 |
| Review Workload Forecast | MISSED | See WARNING-5 |

---

## Assertion Quality Audit

Scanned all 9 test files touched by this change.

| Check | Result |
|---|---|
| Tautologies | 0 found |
| Type-only assertions used alone | 0 found |
| Ghost loops over possibly-empty collections | 0 found |
| Mock-heavy files (mocks more than 2x assertions) | 0 found (worst ratio 4 mocks / 3 expects) |
| Smoke-test-only without behavioural assertion | 2 found — `metric-trend-chart-render.test.tsx:16` (not.toThrow only) and `vital-trend-render.test.tsx:24` (asserts only the label text, which a flat list would also render) |

Assertion quality: 0 CRITICAL tautologies, 2 WARNING-grade smoke-only assertions, both feeding CRITICAL-1.

---

## Issues

### CRITICAL

CRITICAL-1 — The two health-vitals chart scenarios have no covering runtime assertion, and the exact bug live-testing found would still slip through.

- Scenarios affected: "Weight entries render as a chart" and "The chart defaults to full history".
- `tests/unit/metric-trend-chart-render.test.tsx:16` only asserts `not.toThrow()`. A chart that renders zero marks does not throw — which is precisely the fast-follow round-1 defect (a scale factory passed where an instance was required, making every chart render empty).
- `tests/unit/vital-trend-render.test.tsx:24` asserts only that the text "Peso (kg)" appears. A flat list renders that label too, so the assertion cannot distinguish a chart from a list.
- `tests/unit/vital-trend-render.test.tsx:47` (no default time-window truncation) asserts 20 "Eliminar" buttons. That counts the reading list rows below the chart, not points on the chart. The scenario claim is "every logged entry is represented on the chart", which is not what is asserted.
- Proven feasible: a throwaway jsdom probe of `MetricTrendChart` with a 3-point series rendered svg=1, path=1, circle=2 with `d="M62.15,9.5L349.15,103.25L608.39,197"`. A one-line assertion (query the path and check a non-empty `d`, or match segment count to point count) closes both scenarios and creates the missing regression test for the shipped-and-fixed empty-chart bug.
- Impact: correctness of shipped behaviour is not in doubt (build green, five rounds of real browser testing, probe confirms marks render). The gap is regression protection for the one defect this change already hit in real use.
- Remediation: additive test-only change, roughly 4 lines across 2 existing files. No production code change required.

### WARNING

WARNING-1 — Success Criterion 1 over-cites its evidence. `tests/integration/nutrition-visit-delete.test.ts` calls `createNutritionVisitAction` with no `metric_*` fields and no `photos` files; the reading and photo are then created out-of-band via `healthApi.createVitalReading` and a direct table insert. The one-submission composition is therefore verified by code review and live testing, not by that test. Either soften the criterion citation or extend the test FormData to carry a metric field and a File.

WARNING-2 — No apply-progress artifact exists. `mem_search("sdd/nutrition-submodule/apply-progress")` returned nothing; implementation ran directly rather than through a delegated sdd-apply agent. Task-completion cross-checking therefore relied on file/test existence on disk (all confirmed) rather than a reported TDD-cycle table. Acceptable given the disclosed workflow, but RED-first ordering for tasks 1.1 / 2.3 / 4.1 / 6.1 rests on tasks.md and commit ordering, not an independent evidence trail.

WARNING-3 — Legacy-visit completion has no runtime test. The scenario "A legacy visit can be completed" is implemented (`VisitDetail.tsx:91` gate plus `addVisitMetricsAction`) and unit-covered on the list side only. `addVisitMetricsAction` itself is never executed by any test. Since the fast-follow narrowed this path to legacy visits only, it is now the sole entry point for that requirement and deserves one integration case.

WARNING-4 — design.md contract and dependency drift. (a) `TrendPoint` gained `current?: boolean` in fast-follow round 3, but the design Interfaces/Contracts block still shows the 2-field type. (b) `d3-scale@4.0.2` and `@types/d3-scale@4.0.9` were added by fast-follow round 1, but the design File Changes row for package.json lists only the two @tanstack pins. Both are benign additive changes; the design artifact is simply stale. Neither breaks a spec.

WARNING-5 — Review Workload Guard forecast was materially wrong. tasks.md forecast PR1 around 350 and PR2 around 600 lines, both under the 800-line budget. Measured excluding pnpm-lock.yaml: PR1 `eb347b2` = 1,111 insertions / 4 deletions (1,115 changed lines) and PR2 `2b14c1b` = 1,510 insertions / 88 deletions (1,598 changed lines). Both exceed the cached 800-line session budget, PR2 by roughly 2x. Five fast-follow commits added a further 734 insertions / 249 deletions (983 changed lines). Total for the change: 3,066 insertions / 52 deletions across 41 files. Process finding only, no code impact, but worth feeding back into the sdd-tasks estimation heuristic.

### SUGGESTION

SUGGESTION-1 — design.md Open Question still unchecked. The @tanstack/react-charts React 19 peer-support question is empirically resolved (installed, next build exit 0, 396 tests green, jsdom renders real marks). Tick it before archive so the archived design does not carry a false open risk.

SUGGESTION-2 — Stale spec-name reference in a code comment. `nutricion/actions.ts:251-252` cites the requirement "A Visit Is Editable After Creation"; the delta spec renamed it to "A Visit Photos Are Editable After Creation" during the fast-follow. One-word comment fix.

SUGGESTION-3 — Two unrelated commits sit on top of this change on main: `9ce63f8 debug(core): log which branch getCurrentHouseholdId fails on` and `b11f622 fix(auth): ...`. The first ships a debug log statement; worth confirming it is intentional before it is carried forward, though it is out of scope for nutrition-submodule.

SUGGESTION-4 — Verification ran against a working tree carrying unrelated uncommitted edits (`.env.example`, `.gitignore`, `globals.css`, `AccountsScreen.tsx`, `TransactionForm.tsx`). None touch `nutricion/`, `modules/health/`, `supabase/`, or the two design-system pattern files, and every gate passed, so the result stands — but the gates are not evidence about an isolated nutrition-submodule tree.

SUGGESTION-5 — OpenSpec CLI validation unavailable. `pnpm exec openspec validate` fails because the binary is not installed. Delta-spec structure was cross-checked by reading. If the project intends `openspec validate --strict` to be an archive gate, the CLI needs installing.

---

## Verdict

FAIL — 1 CRITICAL, 5 WARNING, 5 SUGGESTION.

The CRITICAL is a test-assertion gap, not a shipped defect. Every gate is green (tsc 0, eslint 0, 396/396 tests, next build 0, 26/26 pgTAP suites with zero failing assertions), the migration and privacy model are faithful to design.md Decision 1, Gate A holds for both fast-follow design-system pattern files, no calculators exist in the diff, and a direct jsdom probe proves the chart renders real plotted marks. What is missing is a covering assertion for the two health-vitals chart scenarios — the same scenarios whose defect had to be caught by manual browser testing rather than by CI.

Recommended path: one small sdd-apply round adding chart-mark assertions to the two existing chart test files (CRITICAL-1), optionally folding in the WARNING-1 and WARNING-3 test extensions and the WARNING-4 / SUGGESTION-1 / SUGGESTION-2 artifact refreshes, then re-verify and archive. If the user prefers to accept the risk on the strength of the five live-testing rounds, this can be archived as-is with CRITICAL-1 recorded as a known follow-up — but that is an explicit user decision, not a verification pass.
