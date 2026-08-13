# Design: Recipes Module

## Technical Approach

`recipes` becomes the fourth peer schema/module, built from the `health` module's shape (schema DDL file + security file, `domain/data/api` triad, Spanish route segment) but with Finance's **write-seam** discipline: direct DML on `recipes.recipes` is revoked from `authenticated` and every mutation goes through a `SECURITY DEFINER` PL/pgSQL function that writes the row **and** its `recipe_changes` audit row in one transaction. That is the only construction in which "a reason is mandatory" is actually true rather than aspirational. Reads stay plain RLS-guarded `select` through repositories. No `visibility` column anywhere — every policy is `core.is_member(household_id)`, full stop.

## Architecture Decisions

### Decision 1 — Mutations are an RPC seam, not two application statements

**Choice**: `recipes.create_recipe / update_recipe / soft_delete_recipe / hard_delete_recipe`, all `security definer set search_path = ''`, opening with `perform core.assert_member(p_household_id)` exactly like `finance.record_transaction`. Ingredients and steps arrive as `jsonb` **parameters** (still stored relationally — the zero-jsonb rule is about columns, not arguments). `revoke insert, update, delete on recipes.recipes` from `authenticated`; only `grant execute` on the seam.
**Rejected**: two-step Server Action code (`insert recipe` → `insert recipe_changes`); a DB trigger deriving the change row.
**Rationale**: `supabase-js` has no client-side multi-statement transaction. Two-step code has a real correctness gap — if the second insert fails, a recipe exists with no audited reason, and `NOT NULL` on `recipe_changes.reason` cannot see across statements. A trigger can enforce that a change row *exists* but cannot know the user's typed reason. The function is the only seam where the reason is an input to the same transaction that writes the recipe. Precedent: `20260804090008_finance_api.sql`.

### Decision 2 — Hard delete destroys the recipe but NOT its audit trail

**Choice**: `recipe_changes.recipe_id` is `on delete set null` (children `recipe_ingredients`/`recipe_steps` are `on delete cascade`), and `recipe_changes` carries denormalized `household_id` plus a `recipe_title` snapshot on every row. Hard delete is a real `delete from recipes.recipes`; the ingredient/step rows die with it, the history rows survive as a title-stamped tombstone including the mandatory `hard_deleted` reason.
**Rejected**: (a) full cascade on `recipe_changes` — "permanent means permanent"; (b) a separate `recipes.deletion_log` table.
**Rationale**: the proposal left a genuine tension: soft delete preserves history *by design*, while "permanent" naturally implies the change rows go too. Full cascade makes the audit trail erasable by escalating to the very action that most needs auditing — an owner who wants history gone hard-deletes instead of soft-deleting, and the log is silently laundered. Denormalizing `household_id` is what keeps RLS answerable once `recipe_id` is null; the title snapshot is what keeps the orphaned rows readable. This costs two columns and one FK-action change versus a whole second table (b). The asymmetry is deliberate and MUST be stated in the migration comment: **content is destroyed, accountability is not.**

### Decision 3 — Owner-only hard delete is an RLS `DELETE` policy over `core.is_owner`

**Choice**: verified — `core.is_owner(uuid)` already exists (`20260804090002_core_security.sql:31`) and encapsulates `household_members.role = 'owner'`. The DELETE policy is `using (core.is_owner(household_id))`; the seam function re-asserts it because `security definer` bypasses RLS.
**Rejected**: inlining a `household_members` subquery in the policy; UI-only enforcement.
**Rationale**: `core.is_owner` is the project's single source of truth for the role check (`households_update`, `household_members_delete` both use it) and avoids the RLS-recursion trap the definer helpers exist to solve. Because the seam is `security definer`, the policy alone is not sufficient — the function's own `if not core.is_owner(...) then raise ... errcode '42501'` is the operative gate, and the policy is the defence-in-depth layer the proposal's success criterion names.

### Decision 4 — Free-text units persist per-household in a two-column table, no icons

**Choice**: `recipes.custom_units (household_id, unit_name, created_at, primary key (household_id, unit_name))`. The seam upserts (`on conflict do nothing`) any submitted unit not in the built-in list. The picklist is `RECIPE_UNITS` (domain constant, carries the icon) ∪ custom units (neutral fallback icon).
**Rejected**: an `icon` column; a `text[]` on `core.households`; no persistence at all.
**Rationale**: icons are presentation and belong beside the constant in `domain/unit.ts`, not in a row a user cannot pick an icon for. A composite PK gives idempotent growth for free and needs no id/sequence.

### Decision 5 — `VideoEmbed` is a pure design-system component with an http(s) allowlist

**Choice**: `src/design-system/patterns/VideoEmbed.tsx`, props `{ url: string; title?: string }` declared locally, zero module imports — the same constraint `MetricTrendChart.tsx` and `PhotoPickerGrid.tsx` satisfy. Direct `/embed/` iframe URLs, **not** a TikTok oEmbed network fetch.
**Rejected**: importing a `Recipe` type; server-side oEmbed resolution.
**Rationale**: **verified** in `eslint.config.mjs` lines 52–91 — `design-system` may import only `design-system | shared`. oEmbed would add a runtime third-party fetch and a failure mode on every detail render for zero visual gain over the documented embed URL.

## Interfaces / Contracts

```ts
// src/design-system/patterns/VideoEmbed.tsx — no module-domain imports (Decision 5)
type EmbedKind = "youtube" | "tiktok" | "drive" | "link" | "invalid";
export function resolveEmbed(url: string): { kind: EmbedKind; src?: string; href?: string };
```

| Platform | Match | Rendered `src` |
|---|---|---|
| YouTube | `/(?:youtube\.com\/(?:watch\?v=\|embed\/\|shorts\/)\|youtu\.be\/)([A-Za-z0-9_-]{11})/` | `https://www.youtube.com/embed/$1` |
| TikTok | `/tiktok\.com\/.*\/video\/(\d+)/` | `https://www.tiktok.com/embed/v2/$1` |
| Drive | `/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/` | `https://drive.google.com/file/d/$1/preview` |
| other | `new URL(url).protocol` is `http:`/`https:` | plain `<a target="_blank" rel="noopener noreferrer">` |
| invalid | anything else (incl. `javascript:`, `data:`) | nothing rendered |

```sql
-- shape of the write seam (Decision 1)
recipes.create_recipe(p_household_id uuid, p_title text, p_category text, p_portions int,
                      p_video_url text, p_ingredients jsonb, p_steps jsonb, p_reason text) returns uuid
recipes.update_recipe(p_recipe_id uuid, ...same..., p_reason text) returns uuid
recipes.soft_delete_recipe(p_recipe_id uuid, p_reason text) returns void
recipes.hard_delete_recipe(p_recipe_id uuid, p_reason text) returns void  -- core.is_owner gate
```

## Schema (migration 1 — `<ts>_recipes_schema.sql`)

```sql
create schema recipes;

create table recipes.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null check (category in ('desayuno','comida','cena','postre','snack')),
  portions int not null default 1 check (portions between 1 and 99),
  video_url text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recipes.recipes (household_id, created_at desc) where is_deleted = false;
create trigger recipes_touch_updated_at before update on recipes.recipes
  for each row execute function core.touch_updated_at();

create table recipes.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes.recipes(id) on delete cascade,
  position int not null check (position >= 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  quantity numeric(10,2) check (quantity > 0),   -- null for 'al gusto'
  unit text not null,
  unique (recipe_id, position) deferrable initially deferred
);

create table recipes.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes.recipes(id) on delete cascade,
  position int not null check (position >= 0),
  instruction text not null check (length(btrim(instruction)) >= 1),
  unique (recipe_id, position) deferrable initially deferred
);

-- Decision 2: `set null`, NOT cascade. A hard delete destroys the recipe's CONTENT;
-- its accountability trail survives as a title-stamped orphan. Do not "fix" this to cascade.
create table recipes.recipe_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  recipe_id uuid references recipes.recipes(id) on delete set null,
  recipe_title text not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('created','edited','soft_deleted','restored','hard_deleted')),
  reason text not null check (length(btrim(reason)) >= 3),
  created_at timestamptz not null default now()
);
create index on recipes.recipe_changes (recipe_id, created_at desc);
create index on recipes.recipe_changes (household_id, created_at desc);

create table recipes.custom_units (
  household_id uuid not null references core.households(id) on delete cascade,
  unit_name text not null check (length(btrim(unit_name)) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (household_id, unit_name)
);
```

`restored` is included in the action enum now (one word, zero code) so a future undelete does not need a CHECK migration.

## RLS (migration 2 — `<ts>_recipes_security.sql`)

Every policy is `to authenticated` and `core.is_member(...)` with **no** visibility branch. Children are scoped through an `exists` on the parent, matching how the repo scopes by tenancy.

```sql
create policy recipes_select on recipes.recipes for select to authenticated
  using (core.is_member(household_id));
-- no INSERT/UPDATE policy: DML is revoked; the seam is the only write path (Decision 1).
create policy recipes_delete on recipes.recipes for delete to authenticated
  using (core.is_owner(household_id));            -- Decision 3, defence in depth

create policy recipe_ingredients_select on recipes.recipe_ingredients for select to authenticated
  using (exists (select 1 from recipes.recipes r
                  where r.id = recipe_id and core.is_member(r.household_id)));
-- recipe_steps: identical shape.
create policy recipe_changes_select on recipes.recipe_changes for select to authenticated
  using (core.is_member(household_id));           -- works after recipe_id goes null
create policy custom_units_select on recipes.custom_units for select to authenticated
  using (core.is_member(household_id));

revoke all on all tables    in schema recipes from anon, authenticated;
revoke all on all functions in schema recipes from anon, authenticated;
alter default privileges in schema recipes revoke all on tables    from anon, authenticated;
alter default privileges in schema recipes revoke all on functions from anon, authenticated;
grant usage on schema recipes to authenticated;
grant select on recipes.recipes, recipes.recipe_ingredients, recipes.recipe_steps,
                recipes.recipe_changes, recipes.custom_units to authenticated;
grant execute on function recipes.create_recipe(...), recipes.update_recipe(...),
                          recipes.soft_delete_recipe(uuid, text),
                          recipes.hard_delete_recipe(uuid, text) to authenticated;
```

## Data Flow

```
RecipeForm (client) ──FormData(+reason)──→ actions.ts
                                             └─→ recipesApi.saveRecipe
                                                   └─ rpc recipes.create_recipe   ┐ ONE txn
                                                        ├─ insert recipes.recipes │
                                                        ├─ insert ingredients×N   │
                                                        ├─ insert steps×M         │
                                                        ├─ upsert custom_units    │
                                                        └─ insert recipe_changes  ┘ reason NOT NULL

recetas/page.tsx (server) → listRecipes(householdId, {q, category}) → RecipeList
recetas/[id]/page.tsx    → getRecipe + listIngredients/Steps/Changes → RecipeDetail → VideoEmbed
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<ts>_recipes_schema.sql` | Create | Schema, 5 tables, indexes, `core.touch_updated_at` trigger |
| `supabase/migrations/<ts>_recipes_api.sql` | Create | The 4 `security definer` seam functions |
| `supabase/migrations/<ts>_recipes_security.sql` | Create | RLS policies + revoke/grant |
| `src/modules/recipes/domain/recipe.ts` | Create | `RECIPE_CATEGORIES`, `isValidCategory`, `reasonIsPresent`, `normalizePositions` |
| `src/modules/recipes/domain/unit.ts` | Create | `RECIPE_UNITS` (+icons), `mergeUnitOptions(builtIn, custom)` |
| `src/modules/recipes/data/recipe-repository.ts` | Create | `listRecipes` (search/filter, excludes `is_deleted`), `getRecipeById`, RPC wrappers |
| `src/modules/recipes/data/recipe-history-repository.ts` | Create | `listRecipeChanges` |
| `src/modules/recipes/data/custom-unit-repository.ts` | Create | `listCustomUnits` |
| `src/modules/recipes/api/index.ts` | Create | `server-only` barrel (Gate A) |
| `src/app/(app)/(recipes)/layout.tsx` | Create | Module shell, mirrors `(health)/layout.tsx` |
| `src/app/(app)/(recipes)/recetas/page.tsx` | Create | Server list container, `searchParams` q + category |
| `src/app/(app)/(recipes)/recetas/actions.ts` | Create | create/edit/soft-delete/hard-delete Server Actions |
| `src/app/(app)/(recipes)/recetas/RecipeList.tsx` | Create | Client list + search box + category chips |
| `src/app/(app)/(recipes)/recetas/RecipeForm.tsx` | Create | Client create/edit (dynamic ingredient + step rows, reason field) |
| `src/app/(app)/(recipes)/recetas/[id]/page.tsx` | Create | Server detail container |
| `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx` | Create | Client detail, collapsed history, delete confirmations |
| `src/design-system/patterns/VideoEmbed.tsx` | Create | `resolveEmbed` + iframe/link render |
| `src/design-system/patterns/IngredientRow.tsx` | Create | Qty + unit select + name row |
| `src/design-system/patterns/StepRow.tsx` | Create | Numbered instruction row with reorder handles |
| `src/app/(app)/page.tsx` | Modify | One `MODULES` entry: `{ label: "Recetas", icon: ChefHat, href: "/recetas" }` |
| `supabase/tests/150_recipes.sql` | Create | pgTAP RLS + reason enforcement |

## Module Boundary Check

**Verified, not assumed** — `eslint.config.mjs` lines 20–91. `boundaries/elements` are globs (`src/modules/*/api/**`, `.../domain/**`, `.../data/**`), so `recipes` is covered the moment the folders exist. Allowed edges used here: `app → module-api | design-system | shared`, `module-api → own domain/data | shared`, `module-data → own domain | shared`, `design-system → design-system | shared`. The Gate B `no-restricted-imports` block is scoped to `src/modules/core/**` only and is unaffected. **Zero ESLint config changes.**

## Testing Strategy (strict_tdd = false → critical-logic RED-first)

| Layer | What | RED first? |
|---|---|---|
| pgTAP `supabase/tests/150_recipes.sql` | A non-member `select` on another household's recipe returns 0 rows (no-visibility-leak); a non-owner `hard_delete_recipe` raises `42501`; direct `insert into recipes.recipes` as `authenticated` is denied; `recipe_changes.reason` rejects null/blank; hard delete leaves `recipe_changes` rows with `recipe_id is null` and the title snapshot intact | **Yes** |
| Integration (Vitest) | `create_recipe` with a blank reason writes **no** recipe row (atomicity of the seam); soft delete removes the recipe from `listRecipes` while its history remains readable | **Yes** |
| Unit (Vitest) | `resolveEmbed` per-platform matches + `javascript:` / `data:` rejection; `mergeUnitOptions` dedupes built-in vs custom; `normalizePositions` | **Yes** (embed sanitiser is a threat-matrix row) |
| Unit (RTL) | `RecipeForm` blocks submit with an empty reason; `RecipeList` search/filter render; `RecipeDetail` history collapsed by default | No — extend after implementation |

## Threat Matrix

| Row | Status | Behavior / RED test |
|---|---|---|
| Executable-file classification / untrusted content rendering | **Applicable** | `video_url` is user-controlled and lands in an `iframe src` / `<a href>`. `resolveEmbed` allowlists http/https and the three known hosts; everything else renders nothing. `javascript:`/`data:` rejection is a RED unit test. `rel="noopener noreferrer"` + `sandbox` on the iframe. |
| Routing | N/A | New static Next.js segments only; no redirect target built from user input. |
| Shell / subprocess | N/A | None. |
| VCS/PR automation | N/A | None. |
| Process integration | N/A | No new external process; the embed is a browser-side iframe, no server-side fetch (Decision 5). |

## Migration / Rollout

Additive only — three new migration files, one line in `src/app/(app)/page.tsx`. No existing table, policy, or module is touched. Apply locally (`supabase db reset`) then remotely. Rollback: `drop schema recipes cascade` plus revert the app commit. No backfill.

## Review Workload Forecast (handoff to `sdd-tasks`)

`800-line budget risk: High` — five stacked slices, each independently deployable:

| Slice | Scope | Est. lines |
|---|---|---|
| 1 | `_recipes_schema.sql` + `_recipes_api.sql` + `_recipes_security.sql` + pgTAP `150_recipes.sql` | ~420 |
| 2 | `domain/{recipe,unit}.ts` + 3 repositories + `api/index.ts` + domain unit tests | ~330 |
| 3 | `(recipes)/layout.tsx` + `recetas/{page,actions,RecipeList,RecipeForm}.tsx` + `IngredientRow`/`StepRow` + hub `MODULES` entry | ~520 |
| 4 | `recetas/[id]/{page,RecipeDetail}.tsx` — history section, soft/hard delete confirmations, reason prompts + integration tests | ~330 |
| 5 | `VideoEmbed.tsx` + `resolveEmbed` tests + detail wiring | ~180 |

Slice 1 ships dormant schema; slice 2 is unreferenced library code; slice 3 is a working create/list app without detail; slice 4 completes the audit surface; slice 5 is a pure presentation upgrade over an already-stored URL.

## Open Questions

- [x] Hard-delete vs. history asymmetry — RESOLVED in Decision 2 (`on delete set null` + title snapshot); this was the one thing the proposal left genuinely open.
- [ ] TikTok's `/embed/v2/` iframe may be blocked by a future CSP or by TikTok itself for some videos. The `link` fallback is always reachable, but `sdd-apply` should verify one real TikTok URL renders during live testing before calling slice 5 done.
