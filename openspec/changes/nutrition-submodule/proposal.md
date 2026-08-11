# Proposal: Nutrition Submodule (Visit-Scoped Metrics, Private Photos, Trend Charts)

## Intent

`nutrition-tracking` shipped the *type* (`health.events.event_type='nutrition'`) and the *metrics* (19 `vital_readings` values), but they are structurally disconnected: `vital_readings` has no visit grouping key, so a real nutritionist consultation is scattered across one event row plus N unrelated metric rows. Photos of the physical "Ficha de Seguimiento" have nowhere to live, and `VitalTrend.tsx` is still the flat list its own comment flags as deferred. This change makes a *visit* a single coherent record.

## Scope

### In Scope

- Nullable `event_id uuid references health.events(id)` on `health.vital_readings`.
- New `health.nutrition_visit_photos` table (`event_id`, `owner_user_id`, `storage_path`, `created_at`) + first Supabase Storage bucket in this repo, owner-scoped policy.
- New `/nutricion` route: create/list/detail of a visit composing event + metrics + photos in one flow. Reached via `OverflowMenu` in `(health)/layout.tsx` (Finance's established pattern).
- Remove `Nutrición` from the generic `/salud` EventForm type dropdown (settled decision 1); read/edit of existing nutrition rows unaffected at DB level.
- `@tanstack/charts` + `@tanstack/react-charts` (v0.11.0, pinned), one shared `design-system/patterns/` chart component; upgrade `VitalTrend.tsx` and reuse in visit detail.
- `health/api` barrel re-exports for the new repository + signed-URL function.

### Out of Scope

- Calculators (calorie/macro/BMI/protein/deficit/water) — deferred to a separate change (settled decision 6).
- Backfill of existing visit-less `vital_readings` — stay `event_id = null` (settled decision 7).
- DB trigger enforcing `event_type='nutrition'` on the link — app-layer validation only (settled decision 2).
- New wrapper `nutrition_visits` table — rejected, Approach 1 confirmed (settled decision 3).
- Meal plans, recipes, household sharing of photos.

## Capabilities

### New Capabilities

- `health-nutrition-visits`: a nutrition visit as one composed record (event + visit-scoped metrics + always-private photos), created only through `/nutricion`.

### Modified Capabilities

- `health-events`: `nutrition` is no longer creatable from the generic event form; `/nutricion` is its sole creation path.
- `health-vitals`: readings may carry an optional visit link; the trend surface becomes a real chart, not a list.
- `health-privacy`: visit photos are always owner-private, independent of the event's `visibility`.

## Approach

Exploration Approach 1: the `nutrition` `health.events` row **is** the visit — it already carries date, provider, cost, notes, visibility. Two additive schema pieces (one nullable FK column, one new table) point at that row directly. The Finance-posting seam (`createHealthEventAction`, `findByOrigin`, void-on-delete) is reused byte-unchanged, so `health-events`' six existing requirements and their tests stay green. Photo storage is genuinely new infrastructure: private bucket, `owner_user_id`-prefixed object paths, server-side `createSignedUrl` only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | FK column, photos table, bucket + policy |
| `src/modules/health/domain/vital.ts` | Modified | Optional visit link in the reading shape |
| `src/modules/health/data/vital-repository.ts` | Modified | Accept/return `event_id` |
| `src/modules/health/data/nutrition-photo-repository.ts` | New | Photos CRUD + signed URLs |
| `src/modules/health/api/index.ts` | Modified | Barrel re-exports (Gate A) |
| `src/app/(app)/(health)/nutricion/` | New | Route, form, list, detail |
| `src/app/(app)/(health)/layout.tsx` | Modified | `OverflowMenu` for 4th destination |
| `src/app/(app)/(health)/salud/EventForm.tsx` | Modified | Remove `Nutrición` option |
| `src/app/(app)/(health)/signos/VitalTrend.tsx` | Modified | List → chart |
| `src/design-system/patterns/` | New | Chart wrapper component |
| `package.json` | Modified | Two pinned chart deps |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Combined scope far exceeds the 800-line review budget | High | `sdd-tasks` must forecast stacked slices (schema+data → route → photos/storage → chart) |
| First Storage bucket = new attack surface | Med | Policy reviewed explicitly, not copy-pasted; signed URLs server-side only |
| Pre-1.0 chart lib API churn | Med | Exact pinned versions; isolate behind one wrapper component so a swap touches one file |
| Orphan legacy nutrition events (created via `/salud` before this ships) | Med | `/nutricion` list must include them read-only-compatible; no data rewrite |
| App-layer-only link validation drifts | Low | Validate in the single `/nutricion` server action; no other write path exists |

## Rollback Plan

Revert the app commit; drop `nutrition_visit_photos`, drop the `event_id` column, delete the bucket. Both schema pieces are purely additive, so existing events and readings are unaffected by the revert. Re-adding `Nutrición` to the `/salud` dropdown is a one-line restore.

## Dependencies

- `nutrition-tracking` (archived 2026-08-10) — shipped.
- `@tanstack/charts` + `@tanstack/react-charts` v0.11.0.

## Success Criteria

- [ ] A visit created in `/nutricion` produces one event, N `vital_readings` with that `event_id`, and 0..N private photos.
- [ ] It still posts exactly one `finance.transactions` row with `origin_module='health'`.
- [ ] `Nutrición` is absent from the `/salud` type dropdown.
- [ ] A photo URL is unreachable by a household member of a household-shared visit.
- [ ] `/signos` and the visit detail both render a real chart from the shared component.
- [ ] No calculators appear anywhere in the diff.

## Delivery Notes (cached preflight)

Execution mode: interactive · Artifact store: hybrid · Delivery strategy: ask-on-risk · Review budget: 800 changed lines · strict_tdd: false (critical-logic focus).

## Proposal question round

Decisions 1–7 are settled and not re-asked. Genuine product questions, now resolved with the user:

1. **Post-visit editing** — SETTLED: editable after creation. A visit can be reopened to add/correct metrics or photos later (e.g. a lab result that arrives after the consult).
2. **Delete semantics** — SETTLED: unlink, don't cascade-delete. Deleting the nutrition event nulls `event_id` on its `vital_readings` (they stay visible in `/signos` as unlinked entries, matching how `health-events`' existing void-not-hard-delete pattern treats linked Finance transactions); linked photos ARE deleted from the private bucket.
3. **Legacy nutrition events** (created via `/salud` before this ships) — SETTLED: appear in `/nutricion` as zero-metric visits, completable later now that post-visit editing is settled.
4. **Photo limits** — SETTLED: up to 6 photos per visit, JPG/PNG/WebP, 10MB each.
5. **Chart default window** — SETTLED: opens showing the full history for that metric (no default time-window truncation).
