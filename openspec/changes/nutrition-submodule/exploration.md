# Exploration: nutrition-submodule (Visita/Consulta entity, private photos, real trend charts)

## Current State

`health.events` (type=`nutrition`) and `health.vital_readings` (19 metric values, 14 body-composition, from the archived `nutrition-tracking` change) are two structurally disconnected tables. `health.vital_readings` has no visit/session grouping key — only a free `measured_at timestamptz` (confirmed in `src/modules/health/domain/vital.ts` and `src/modules/health/data/vital-repository.ts`). Nutrition is entered today as: (1) a `Tipo=Nutrición` option inside `src/app/(app)/(health)/salud/EventForm.tsx` (creates one `health.events` row, posts to Finance via `createHealthEventAction` in `src/app/(app)/(health)/salud/actions.ts`, composing `health/api` + `finance/api` side by side per the archived `nutrition-tracking` design's Decision 5), and (2) metric-by-metric entries in `src/app/(app)/(health)/signos/VitalForm.tsx`/`VitalTrend.tsx`, with zero shared key to (1). `VitalTrend.tsx` is a flat chronological list (own comment: "A full chart is out of scope for this cycle"). Health's nav (`src/app/(app)/(health)/layout.tsx`) has exactly 3 direct-icon slots + 1 FAB (Eventos/Signos/Perfil) and does not yet use the `OverflowMenu` pattern Finance's `(finance)/layout.tsx` already established for a 4th+ destination. No Supabase Storage usage exists anywhere in `src/` (zero `storage.from` matches), and no chart library is installed (`package.json` verified). Current TanStack docs confirm `@tanstack/charts` (core grammar) + `@tanstack/react-charts` (React adapter) is the correct install pair; the old standalone `react-charts` is unmaintained.

## Affected Areas

- `supabase/migrations/` — new FK column(s) linking `health.vital_readings` to `health.events`, new `health.nutrition_visit_photos` table, new private Storage bucket + policy.
- `src/modules/health/domain/` — possible new predicates (e.g., photo-always-private regardless of visit visibility).
- `src/modules/health/data/` — extend `vital-repository.ts`; new photo repository for the photos table + signed-URL retrieval.
- `src/modules/health/api/index.ts` — re-export new repository/domain surface (Gate A barrel rule).
- `src/app/(app)/(health)/salud/EventForm.tsx`, `EventList.tsx`, `actions.ts` — decide whether `Nutrición` stays selectable in the generic dropdown or funnels to the dedicated flow.
- `src/app/(app)/(health)/signos/VitalForm.tsx`, `VitalTrend.tsx` — chart upgrade + any new link column.
- `src/app/(app)/(health)/layout.tsx` — needs a 4th top-level destination; no free icon slot today.
- New `src/app/(app)/(health)/nutricion/` route — the dedicated tab.
- `openspec/specs/health-events/spec.md`, `health-vitals/spec.md` — MODIFIED/ADDED deltas for linkage, photo privacy, trend charting.
- `eslint.config.mjs` boundaries — no change needed if everything stays inside `modules/health/{domain,data,api}`.

## Approaches

1. **Direct FK on `vital_readings` + new photos table, both referencing `health.events(id)` directly** — no new "visit" table; the nutrition-type `health.events` row *is* the visit (already carries date/provider/cost/notes/visibility). Nullable `event_id` FK on both. Existing visit-less rows and future ad-hoc `/signos` quick logs stay `event_id = null` — matches this project's forward-only, no-silent-backfill convention. Finance-posting seam untouched.
   - Pros: minimal additive diff; zero risk to `health-events`' six existing spec requirements/tests; no data migration risk; matches this project's demonstrated bias toward additive widenings.
   - Cons: `health.events` conceptually overloaded as "the visit" for one of five types; needs an optional trigger to guarantee a linked `event_id` is actually `event_type='nutrition'`.
   - Effort: Low–Medium.

2. **New `health.nutrition_visits` wrapper table**, 1:1 via unique `event_id` FK; readings/photos reference the visit's id instead.
   - Pros: dedicated domain object with room to grow; cleaner naming.
   - Cons: unnecessary indirection — no expressed need for a visit-only column beyond what `health.events` already stores; extra join everywhere; more surface for the same outcome.
   - Effort: Medium.

3. **Full replacement**: retire the `nutrition` event type; new `nutrition_visits` table posts to Finance independently.
   - Cons: duplicates the entire proven, tested costed-event Finance-posting seam; reopens the just-archived `health-events` spec for no functional gain.
   - Effort: High. Rejected.

## Recommendation

**Approach 1.** It directly answers the "does the costed-event posting flow attach to the visit or a generic event" question: it attaches to the same event row as today, unchanged, because that row already is the visit. Lowest risk, consistent with this project's two prior Health cycles (additive widenings over new parallel tables), and doesn't reopen a spec that just archived as "Complete, verified."

Supporting design threads left open for `sdd-design` (not decided here):
- Nav: add `OverflowMenu` to `(health)/layout.tsx` (Finance's existing pattern) rather than redesign the `NavPill`.
- Entry-path consolidation: recommend removing `Nutrición` from the generic `/salud` dropdown once `/nutricion` ships, to prevent orphan events with no linked metrics/photos.
- Photos: private bucket (e.g. `nutrition-photos`), owner-prefixed object naming, storage RLS keyed on `auth.uid()`, deliberately independent of the visit's own `visibility` — genuinely new infrastructure in this repo.
- Chart: one shared `design-system/patterns/` component wrapping `@tanstack/react-charts` + `@tanstack/charts`, reused by both the upgraded `VitalTrend.tsx` and the new visit-detail trend view.
- DB integrity: whether a trigger enforcing `event_type='nutrition'` on the link is worth it vs. app-layer-only enforcement (this module's established "defensive UX guard, DB not sole authority for this predicate" pattern elsewhere).

## Risks

- Combined scope (FK+table+bucket/policy+new chart dep+new route+nav change) likely exceeds the 400-line review budget as one PR — `sdd-tasks` should forecast chained/stacked slices (user's review budget for this change is 800 lines, ask-on-risk).
- `@tanstack/charts`/`@tanstack/react-charts` is pre-1.0 (v0.11.0), no API-stability guarantee (user-accepted risk) — pin exact versions.
- Zero prior Storage/RLS-policy precedent in this repo — first bucket-access-policy surface, needs careful review, no existing pattern to copy.
- Keeping `Nutrición` selectable in both the generic dropdown and the new dedicated tab could produce visits with no linked metrics/photos, undermining the "one record per visit" goal — needs an explicit decision in `sdd-propose`/`sdd-design`.
- Calculators remain explicitly out of scope — do not let chart/metric work drift into derived-value computation.

## Ready for Proposal

Yes. Grounded in real code reads, not assumptions. Flag to the user before proposing: (a) whether `Nutrición` stays in the generic `/salud` dropdown once the dedicated tab exists, and (b) whether the `event_id` link needs a DB trigger.

## Key Learnings

1. `health.vital_readings` has no visit/session grouping key today — only a free `measured_at` timestamp — which is why nutrition events and vitals are currently unlinked.
2. The nutrition-type `health.events` row already carries every field a "visit" needs, so the lowest-risk visit model is a direct FK from `vital_readings`/a new photos table to that existing row, not a new wrapper table.
3. This repository has zero prior Supabase Storage usage anywhere in `src/` — a private photos bucket + RLS-equivalent policy is genuinely new infrastructure here.
4. `@tanstack/charts` is the core charting grammar and `@tanstack/react-charts` is its separate React framework adapter — both packages are required together for a React integration.
5. Health's bottom nav has no free icon slot for a 4th top-level tab today; Finance's established `OverflowMenu` pattern is the lowest-diff way to add one.
