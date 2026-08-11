# Design: Nutrition Submodule

## Technical Approach

Two additive schema pieces point at the existing `nutrition` `health.events` row (Approach 1, settled decision 3): a nullable FK on `health.vital_readings` and a new owner-private `health.nutrition_visit_photos` table backed by this repo's **first** Supabase Storage bucket. The Finance seam (`createHealthEventAction`'s compose-at-the-action pattern, `findByOrigin` + `voidTransactionById`) is reused unchanged. All new code lands inside `src/modules/health/{domain,data,api}`, `src/app/(app)/(health)/nutricion/`, and one `design-system/patterns/` file.

## Architecture Decisions

### Decision 1 — Photos are owner-only at BOTH the row and the object layer

**Choice**: `nutrition_visit_photos` RLS `select` uses `owner_user_id = (select auth.uid())` **only** — no `visibility = 'household'` branch — and the bucket is private with an `auth.uid()`-prefixed object path.
**Rejected**: mirroring `vital_readings_select` (household-or-owner); signed URLs generated client-side.
**Rationale**: every other `health` table's select policy is `core.is_member(...) and (visibility='household' or owner...)`. Copy-pasting it here would leak a `visibility='household'` visit's Ficha photo to household members, contradicting the `health-privacy` capability. This is the one deliberate divergence from the schema's house pattern; it is documented in the migration comment so a future reader does not "fix" it back. `household_id` is still stored (tenancy parity + `core.is_member` on insert), it just does not widen `select`.

### Decision 2 — Link validation lives in one server action, not a trigger

**Choice**: `assertNutritionEvent()` helper in `src/app/(app)/(health)/nutricion/actions.ts`, called by every write path that supplies an `event_id`; it loads the event via `healthApi.getEventById` and rejects unless `eventType === "nutrition"`.
**Rejected**: DB trigger (settled decision 2); repository-layer check.
**Rationale**: `/nutricion` is the sole creation path for the link, and `nutrition` is being removed from the `/salud` dropdown — so a single choke point is genuinely single. The repository stays dumb RLS-guarded CRUD, matching `vital-repository.ts`.

### Decision 3 — Distinct add-actions, not a reused create action

**Choice**: `createNutritionVisitAction` (event + first metrics + first photos + Finance post) plus narrow `addVisitMetricsAction`, `addVisitPhotosAction`, `deleteVisitPhotoAction`, `deleteNutritionVisitAction`.
**Rejected**: one idempotent upsert-style action reused for post-visit edits.
**Rationale**: only creation posts to Finance. Reusing it for an "add one photo" edit would force that action to re-decide idempotency/void semantics on every keystroke path; splitting keeps the Finance seam byte-identical to `salud/actions.ts`.

### Decision 4 — Delete = unlink metrics, hard-delete photos, void the transaction

**Choice**: `on delete set null` on `vital_readings.event_id`; `on delete cascade` on `nutrition_visit_photos.event_id`; the action explicitly removes Storage objects *before* deleting rows; the Finance transaction is **voided**, never deleted.
**Rejected**: cascading readings (destroys `/signos` history the user still needs); relying on cascade alone for photos (leaves orphan Storage objects forever).
**Rationale**: readings are independently meaningful outside the visit; photos are not. Storage-first ordering means a Storage failure aborts with rows intact (a recoverable pointer), instead of rows gone and bytes orphaned.

### Decision 5 — Chart component takes primitive series, not domain types

**Choice**: `src/design-system/patterns/MetricTrendChart.tsx` with locally-declared prop types; callers map readings into `series`.
**Rejected**: importing `VitalMetric` from `@/modules/health/api`.
**Rationale**: **verified** in `eslint.config.mjs` — `boundaries/element-types` allows `design-system → design-system | shared` only. A domain import would fail Gate A. This is also what lets `/signos` and the visit detail share it.

### Decision 6 — Health nav mirrors Finance's 4-slot shape

**Choice**: `/perfil` moves out of the direct links into a new `OverflowMenu` alongside `/nutricion`; slots stay `salud · Fab · signos · OverflowMenu`.
**Rejected**: a 5th direct pill.
**Rationale**: `(finance)/layout.tsx` is exactly 3 links + `OverflowMenu`; a 5-slot `NavPill` has no precedent or styling in this repo.

## Migration

One file, `supabase/migrations/<ts>_health_nutrition_visits.sql`:

```sql
alter table health.vital_readings
  add column event_id uuid references health.events(id) on delete set null;
create index on health.vital_readings (event_id) where event_id is not null;

create table health.nutrition_visit_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  event_id uuid not null references health.events(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index on health.nutrition_visit_photos (event_id);

alter table health.nutrition_visit_photos enable row level security;
-- Decision 1: OWNER-ONLY select. Intentionally NOT the household-or-owner shape used by
-- health.events / vital_readings / profile_facts.
create policy nutrition_visit_photos_select on health.nutrition_visit_photos
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy nutrition_visit_photos_insert on health.nutrition_visit_photos
  for insert to authenticated
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));
create policy nutrition_visit_photos_delete on health.nutrition_visit_photos
  for delete to authenticated using (owner_user_id = (select auth.uid()));
-- no UPDATE policy: a photo is immutable; "replace" is delete + insert.

grant select, insert, delete on health.nutrition_visit_photos to authenticated;

insert into storage.buckets (id, name, public) values
  ('health-nutrition-photos','health-nutrition-photos', false)
  on conflict (id) do nothing;
```

Storage policies on `storage.objects` (select / insert / delete, `to authenticated`), object path `{owner_user_id}/{event_id}/{uuid}.{ext}`:

```sql
using (bucket_id = 'health-nutrition-photos'
       and (storage.foldername(name))[1] = (select auth.uid())::text)
```

Also add the bucket to `supabase/config.toml`'s commented `[storage.buckets.*]` block with `public = false`, `file_size_limit = "10MiB"`, `allowed_mime_types = ["image/jpeg","image/png","image/webp"]`.

## Data Flow

```
VisitForm (client) ──FormData──→ createNutritionVisitAction
                                   │ assertNutritionEvent / type='nutrition'
                                   ├─→ healthApi.createEvent            → health.events
                                   ├─→ financeApi.recordTransaction     → finance.transactions (if costed)
                                   ├─→ createVitalReading × N (eventId) → health.vital_readings
                                   └─→ storage.upload → insertPhoto × M → nutrition_visit_photos

[id]/page.tsx (server) → listVisitPhotos → createPhotoSignedUrl(300s) → <img src>
                       → listVitalReadings(eventId) → MetricTrendChart
```

Signed URLs are minted only in `data/nutrition-photo-repository.ts` (`createPhotoSignedUrl`), re-exported through `health/api`; the bucket is never public and no anon key path exists.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<ts>_health_nutrition_visits.sql` | Create | FK, photos table, RLS, grants, bucket + object policies |
| `supabase/config.toml` | Modify | Declare the private bucket for the local stack |
| `src/modules/health/domain/vital.ts` | Modify | Optional `eventId` on the reading shape |
| `src/modules/health/data/vital-repository.ts` | Modify | Accept/return `event_id`; `listVitalReadings(..., { eventId })` filter |
| `src/modules/health/data/nutrition-photo-repository.ts` | Create | `listVisitPhotos`, `insertPhoto`, `deletePhoto`, `removeObjects`, `createPhotoSignedUrl` |
| `src/modules/health/api/index.ts` | Modify | Re-export the above (Gate A) |
| `src/app/(app)/(health)/nutricion/page.tsx` | Create | Server list container (includes legacy zero-metric visits) |
| `src/app/(app)/(health)/nutricion/actions.ts` | Create | 5 actions + `assertNutritionEvent` |
| `src/app/(app)/(health)/nutricion/VisitForm.tsx` | Create | Client: event fields + metric grid + file input |
| `src/app/(app)/(health)/nutricion/VisitList.tsx` | Create | Client rows |
| `src/app/(app)/(health)/nutricion/[id]/page.tsx` | Create | Server detail: signed photo URLs + chart + add-forms |
| `src/app/(app)/(health)/nutricion/[id]/VisitDetail.tsx` | Create | Client detail interactions |
| `src/app/(app)/(health)/layout.tsx` | Modify | `OverflowMenu` (Nutrición + Perfil) |
| `src/app/(app)/(health)/salud/EventForm.tsx` | Modify | Remove the `Nutrición` option |
| `src/app/(app)/(health)/signos/VitalTrend.tsx` | Modify | List → `MetricTrendChart` |
| `src/design-system/patterns/MetricTrendChart.tsx` | Create | `@tanstack/react-charts` wrapper |
| `package.json` | Modify | `"@tanstack/charts": "0.11.0"`, `"@tanstack/react-charts": "0.11.0"` (exact, no caret) |

## Interfaces / Contracts

```ts
// src/design-system/patterns/MetricTrendChart.tsx — no module imports (Decision 5)
export type TrendPoint = { measuredAt: string; value: number };
export type TrendSeries = { key: string; label: string; points: TrendPoint[] };
export type MetricTrendChartProps = {
  series: TrendSeries[];       // full history by default; caller windows, component never does
  height?: number;             // default 220
  emptyLabel?: string;
};

// src/modules/health/data/nutrition-photo-repository.ts
export const NUTRITION_PHOTO_BUCKET = "health-nutrition-photos";
export function buildPhotoPath(ownerUserId: string, eventId: string, ext: string): string;
export async function createPhotoSignedUrl(
  supabase: SupabaseClient, storagePath: string, expiresInSeconds?: number,
): Promise<string | null>;
```

## Module Boundary Check

**Verified, not assumed** — read `eslint.config.mjs` lines 21–91. Every new file falls under an existing element type: `app → module-api | design-system | shared`, `module-api → own module-domain | module-data | shared`, `design-system → design-system | shared`. `nutrition-photo-repository.ts` imports only `@supabase/supabase-js` and `../domain`. **No new boundaries rule is required.**

## Testing Strategy (strict_tdd = false → critical-logic RED-first)

| Layer | What | RED first? |
|---|---|---|
| pgTAP `supabase/tests/140_nutrition_visits.sql` | Household member CANNOT select another member's photo row even when the event is `visibility='household'`; storage policy rejects a foreign `foldername(name)[1]`; deleting an event nulls `vital_readings.event_id` and cascades photo rows | **Yes** |
| Unit (Vitest) | `assertNutritionEvent` rejects `consultation`/`study` event ids; `buildPhotoPath` prefixes with owner id | **Yes** |
| Integration | `deleteNutritionVisitAction`: readings survive with `event_id = null`, photo rows + objects gone, Finance transaction **voided not deleted** | **Yes** |
| Unit (RTL) | `MetricTrendChart` empty state; `VisitForm`/`VisitList` render; `Nutrición` absent from `/salud` dropdown | No — extend after implementation |

## Threat Matrix

| Row | Status | Behavior / RED test |
|---|---|---|
| Executable-file classification (user upload) | **Applicable** | Bucket private + MIME allowlist (`image/jpeg,png,webp`) + 10 MB cap; bytes are never served from a public URL, only a 300s signed URL. pgTAP asserts `public = false` on the bucket row. |
| Routing | N/A | New Next.js route segment only; no dynamic dispatch or redirect construction from user input. |
| Shell / subprocess | N/A | No process spawning. |
| VCS/PR automation | N/A | None. |
| Process integration | N/A | None. |

## Migration / Rollout

Apply locally (`supabase db reset`) then remotely. Rollback: drop the photos table, drop the `event_id` column, delete the bucket, revert the app commit. Both schema pieces are additive; existing rows are untouched. No backfill (settled decision 7).

## Review Workload Forecast (handoff to `sdd-tasks`)

`400-line budget risk: High` — recommend three stacked slices:

| Slice | Scope | Est. lines |
|---|---|---|
| 1 | Migration + storage policies + `config.toml` + `vital.ts`/`vital-repository` `eventId` + `nutrition-photo-repository` + api barrel + pgTAP 140 | ~350 |
| 2 | `/nutricion` route (page, actions, form, list, detail) + `EventForm` removal + `(health)/layout.tsx` OverflowMenu | ~400 |
| 3 | `MetricTrendChart` + `VitalTrend` upgrade + detail chart wiring + pinned deps | ~200 |

Each slice is independently deployable: slice 1 ships dormant schema, slice 2 works with the pre-existing list UI, slice 3 is a pure presentation upgrade.

## Open Questions

- [x] Photo limits — SETTLED (proposal.md, "Proposal question round" §4): max 6 photos/visit, `image/jpeg|png|webp`, **10 MB each** (this design's earlier 5 MiB figure was the design agent's own placeholder assumption, made without the proposal file on disk in its isolated worktree — corrected here to match the settled decision). A mid-save upload failure still saves the visit and surfaces a per-photo error, with retry available from the detail view (safe because post-visit editing is settled as allowed).
- [ ] `@tanstack/react-charts` v0.11.0 is pre-1.0 and React 19 peer support is unverified — slice 3 must install and smoke-test before writing the wrapper.
