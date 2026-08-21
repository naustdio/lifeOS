# Design: Shopping List Module (Lista de Compras)

## Technical Approach

`shopping-list` is the fifth peer schema/module, shaped like `recipes` (`domain`/`data`/`api` triad, Spanish route segment, two-file migration split) but with the **direct-RLS write** discipline of `recipes.ingredient_catalog` / `custom_units` / `recipe_favorites` — no `security definer` seam, because no mandatory-reason audit trail exists (`explore.md` §write-seam, precedent #2). Every policy is `core.is_member(household_id)`; no `visibility`, no `user_id` branch.

Items are stored **exploded and un-combined**, one row per contributing origin. Combining is a pure read/render-time aggregation in `domain/combine.ts`, which is what makes the origin sub-line derivable and keeps "Finalizar compra" a single scoped update.

Cross-module recipe reads happen **only at the `app` layer** (spec `shopping-list-module-api`), mirroring `src/app/(app)/(health)/nutricion/actions.ts`. Zero `eslint.config.mjs` changes.

## Architecture Decisions

### Decision 1 — Store-type taxonomy lives in `shopping_list`, not on `recipes.ingredient_catalog`

**Choice**: CONFIRM the proposal's recommendation. Three parts: `shopping_list.store_types` (open, household-scoped, FK-able), `shopping_list.ingredient_store_defaults` keyed by `(household_id, lower(ingredient_name))` so the household "learns" once, and a nullable `store_type_id` on the item row as the per-item override. Resolution order on add: item override → household default → `null` ("Sin categoría" group).
**Rejected**: (a) `store_type_id` column on `recipes.ingredient_catalog`; (b) item-row-only tagging with no learning.
**Rationale**: (a) creates a `shopping_list → recipes` schema dependency in exactly the direction Decision 3 forbids at the code layer, and drags recipe-module migrations into declared out-of-scope. It also strands loose manual items, which have no catalog entry. (b) fails the "learns across the household" value entirely — every list re-tags from scratch. The chosen split keeps the learning behaviour with the ownership arrow pointing the right way, and `ingredient_store_defaults` is keyed by lowercased *name text*, not a catalog FK, so it works identically for recipe-origin and loose items. **This closes the open question; it is not re-openable in tasks.**

### Decision 2 — Cost is one nullable column on the item row, snapshotted at add time

**Choice**: `estimated_unit_cost numeric(10,2) null check (estimated_unit_cost >= 0)` on `shopping_list.items`, identical type/check to `recipes.recipe_ingredients.estimated_unit_cost`. Recipe-origin items **copy** the recipe's value at add time; loose manual items accept the same field as optional user input. One column serves both (spec `shopping-list-continuous` "Estimated Total Cost").
**Rejected**: (a) a separate `manual_cost` column; (b) reading cost live from `recipes` at render time.
**Rationale**: (a) forces every consumer to `coalesce` two columns and doubles the null-handling surface for zero semantic gain. (b) would make the displayed total drift when a recipe is edited *after* the list was generated, and would require a cross-schema join from a module forbidden to know about `recipes`. A snapshot is both correct-by-intent (the price you planned with) and boundary-clean.

### Decision 3 — App-layer composition via plain-data arguments

**Choice**: `src/app/(app)/(shopping-list)/lista-de-compras/actions.ts` imports `@/modules/recipes/api` and `@/modules/shopping-list/api` side by side. It calls `getRecipeById`, applies `scaleRatio = targetPortions / recipe.portions` (verbatim from `RecipeDetail.tsx:206`), and passes a plain `AddItemInput[]` into `addItems`.
**Rejected**: a Gate A `module-api → module-api` carve-out.
**Rationale**: verified in `eslint.config.mjs:58-59` — `from: "app"` allows `module-api`, and `from: "module-api"` allows only its own module's `domain`/`data` + `shared`. `src/app/**` is one boundary element (line 22), so the `(recipes)` entry-point components may import the `(shopping-list)` action without violating anything. Approach 2 would be the codebase's first `module-api → module-api` edge, with zero precedent.

### Decision 4 — Base store types are seeded rows, not a domain constant

**Choice**: an idempotent `ensureBaseStoreTypes(householdId)` (`insert ... on conflict (household_id, lower(name)) do nothing`) called on first list read, seeding Supermercado, Carnicería, Cremería, "Mercado y Frutas y Verduras".
**Rejected**: the `RECIPE_UNITS` constant ∪ `custom_units` merge pattern.
**Rationale**: `custom_units` is referenced by free text, so a constant works there. Here the item row carries `store_type_id` as a real FK, and a constant cannot be an FK target. Seeding is the smallest change that preserves referential integrity; the taxonomy stays open and non-enum as the spec requires.

### Decision 5 — An explicit `lists` row with `active`/`closed` status

**Choice**: `shopping_list.lists (id, household_id, status, estimated_total, closed_at, closed_by_user_id)` with a partial unique index enforcing at most one `active` list per household. "Finalizar compra" flips status to `closed`, stamps `estimated_total`, and lazily creates the next active list.
**Rejected**: item rows with a bare `household_id` and a hard delete on clear.
**Rationale**: the spec requires "Finalizar compra" to produce *a stable identifier for that closed session*, and the proposal's Dependencies require a stable numeric total + stable id for the already-shipped Finance `OriginModule` seam (`origin: { module: "shopping_list", entityId: <list id> }`). A closed list row is exactly that, at the cost of one table. Nothing Finance-facing is *built* here.

## Data Model (migration 1 — `<ts>_shopping_list_schema.sql`)

```sql
create schema shopping_list;

create table shopping_list.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed')),
  estimated_total numeric(12,2),                       -- stamped at close (Decision 5)
  closed_at timestamptz, closed_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index on shopping_list.lists (household_id) where status = 'active';

create table shopping_list.store_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index on shopping_list.store_types (household_id, lower(name));

create table shopping_list.ingredient_store_defaults (       -- Decision 1
  household_id uuid not null references core.households(id) on delete cascade,
  ingredient_name text not null check (length(btrim(ingredient_name)) between 1 and 80),
  store_type_id uuid not null references shopping_list.store_types(id) on delete cascade,
  primary key (household_id, ingredient_name)                -- stored lowercased by the repo
);

create table shopping_list.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_list.lists(id) on delete cascade,
  household_id uuid not null references core.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  quantity numeric(10,2) check (quantity > 0),               -- null = "al gusto"
  unit text not null,
  estimated_unit_cost numeric(10,2) check (estimated_unit_cost >= 0),  -- Decision 2
  store_type_id uuid references shopping_list.store_types(id) on delete set null,
  is_checked boolean not null default false,
  checked_at timestamptz,
  origin_recipe_id uuid,          -- NOT an FK: `recipes` is off-limits to this schema
  origin_recipe_title text,       -- snapshot; null on both = loose manual item
  added_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index on shopping_list.items (list_id, created_at);
```

`origin_recipe_id` is deliberately FK-free: a cross-schema FK would recreate the coupling Decision 1 rejects, and a deleted recipe must not cascade away an already-planned purchase. The title snapshot keeps the origin sub-line readable.

## RLS (migration 2 — `<ts>_shopping_list_security.sql`)

All four tables: `for all to authenticated using (core.is_member(household_id)) with check (core.is_member(household_id))` — direct writes, no seam (`explore.md` precedent #2). `ingredient_store_defaults` and `store_types` carry `household_id` directly, so no `exists` hop is needed anywhere. Then the standard `revoke all` + `alter default privileges` + `grant usage on schema` + `grant select, insert, update, delete` block copied from `_recipes_security.sql`.

## Combining Algorithm (`domain/combine.ts`, pure)

```ts
export type CombinedLine = {
  key: string; name: string; unit: string;
  totalQuantity: number | null;          // null when every contributor is "al gusto"
  estimatedCost: number | null;          // Σ qty × unitCost over priced contributors
  storeTypeId: string | null;            // first non-null contributor wins
  allChecked: boolean;
  contributors: { itemId: string; originLabel: string; quantity: number | null }[];
};
export function combineItems(items: ShoppingListItem[]): CombinedLine[];
```

Key = `` `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}` ``. Different unit ⇒ different key ⇒ separate line, **no conversion** (spec scenario "Same name, different units stay separate"). `originLabel` is `origin_recipe_title ?? "manual"`. Order is stable by each group's earliest `created_at`, so checking never reorders (spec "In-Place Strike-Through"). Check/uncheck on a combined line writes `is_checked` to every contributing row; the sub-line renders only when `contributors.length > 1`.

`domain/scale.ts` holds `scaleQuantity(q, target, base) = q === null ? null : q * (target / base)` with the `base > 0 ? … : 1` guard, matching `RecipeDetail.tsx:206`.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<ts>_shopping_list_schema.sql` | Create | 4 tables + indexes |
| `supabase/migrations/<ts>_shopping_list_security.sql` | Create | RLS + revoke/grant |
| `src/modules/shopping-list/domain/combine.ts` | Create | `combineItems`, key derivation |
| `src/modules/shopping-list/domain/scale.ts` | Create | `scaleQuantity`, `estimatedTotal` |
| `src/modules/shopping-list/data/list-repository.ts` | Create | `getOrCreateActiveList`, `finalizePurchase` |
| `src/modules/shopping-list/data/item-repository.ts` | Create | `listItems`, `addItems`, `setChecked`, `removeItem` |
| `src/modules/shopping-list/data/store-type-repository.ts` | Create | `listStoreTypes`, `ensureBaseStoreTypes`, `createStoreType`, `getIngredientDefaults`, `setIngredientDefault` |
| `src/modules/shopping-list/api/index.ts` | Create | `server-only` barrel; zero `@/modules/recipes` imports |
| `src/app/(app)/(shopping-list)/layout.tsx` | Create | Module shell, mirrors `(recipes)/layout.tsx` |
| `src/app/(app)/(shopping-list)/lista-de-compras/page.tsx` | Create | Server container: list + store types + combined lines |
| `src/app/(app)/(shopping-list)/lista-de-compras/actions.ts` | Create | **Cross-module composition point** (Decision 3) |
| `src/app/(app)/(shopping-list)/lista-de-compras/ShoppingListView.tsx` | Create | Client: grouped render, check, remove, Finalizar compra |
| `src/app/(app)/(shopping-list)/lista-de-compras/AddLooseItemForm.tsx` | Create | Name/qty/unit/optional cost/store type |
| `src/app/(app)/(shopping-list)/planificador/{page,actions,WeeklyPlanner}.tsx` | Create | Producer-only planner (slot assignment + "Agregar a mi lista") |
| `src/design-system/patterns/ShoppingItemRow.tsx` | Create | Struck-through row + origin sub-line |
| `src/design-system/patterns/StoreTypeGroupHeader.tsx` | Create | Group header + per-group subtotal |
| `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx` | Modify | "Generar lista de compras" + portion prompt |
| `src/app/(app)/(recipes)/recetas/RecipeList.tsx` | Modify | Multi-select mode + generate action |
| `src/app/(app)/page.tsx` | Modify | One `MODULES` entry (`ShoppingCart`, `/lista-de-compras`) |
| `supabase/tests/160_shopping_list.sql` | Create | pgTAP RLS |

## Data Flow

```
RecipeDetail / RecipeList / WeeklyPlanner  (client, (recipes) or (shopping-list))
        └─ generateFromRecipesAction({recipeIds, targetPortions})   ← app layer
              ├─ recipesApi.getRecipeById(id)            @/modules/recipes/api
              ├─ scaleQuantity(q, target, recipe.portions)
              ├─ shoppingApi.getIngredientDefaults(...)  → store_type_id resolution
              └─ shoppingApi.addItems(listId, AddItemInput[])   ← PLAIN DATA ONLY

page.tsx → listItems + listStoreTypes ──→ combineItems() ──→ ShoppingListView
                                                               └─ grouped by store type
```

## Interfaces / Contracts

```ts
// src/modules/shopping-list/api/index.ts — plain-data boundary (spec shopping-list-module-api)
export type AddItemInput = {
  name: string; quantity: number | null; unit: string;
  estimatedUnitCost: number | null; storeTypeId: string | null;
  originRecipeId: string | null; originRecipeTitle: string | null;
};
export function addItems(sb, listId, householdId, items: AddItemInput[]): Promise<{ error: string | null }>;
export function finalizePurchase(sb, listId, estimatedTotal: number): Promise<{ closedListId: string | null; error: string | null }>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (Vitest) | `combineItems`: same name+unit merges with summed total and both origins; same name/different unit stays split; `"manual"` label for loose items; null-quantity contributors | RED-first — this is the module's only non-trivial logic |
| Unit (Vitest) | `scaleQuantity` 200 @ 4→8 portions = 400; `portions = 0` guard; null passthrough | RED-first |
| pgTAP `160_shopping_list.sql` | Non-member sees zero rows on all 4 tables; second `active` list per household rejected by the partial unique index; `estimated_unit_cost < 0` rejected | RED-first |
| Integration | Finalizar compra closes the list, stamps `estimated_total`, and the next read yields a new empty active list; checking all items does NOT clear | RED-first |
| RTL | Grouped render incl. "Sin categoría"; check strikes in place without reorder | After implementation |

## Threat Matrix

N/A — no routing built from user input, no shell, subprocess, VCS/PR automation, executable-file classification, or process integration. All new segments are static Next.js paths; all writes are RLS-gated DML.

## Migration / Rollout

Purely additive: two new migration files, one `MODULES` line, two additive recipe-component buttons. No existing table, policy, or module contract changes. No backfill. Rollback: `drop schema shopping_list cascade` + revert the app commit.

## Review Workload Forecast (handoff to `sdd-tasks`)

`800-line budget risk: High` — six stacked slices, each independently deployable:

| Slice | Scope | Est. lines |
|---|---|---|
| 1 | Both migrations + pgTAP `160_shopping_list.sql` | ~320 |
| 2 | `domain/{combine,scale}.ts` + 3 repositories + `api/index.ts` + unit tests | ~420 |
| 3 | `(shopping-list)/layout` + `lista-de-compras/{page,actions,ShoppingListView,AddLooseItemForm}` + hub entry | ~520 |
| 4 | Store-type grouping: `StoreTypeGroupHeader`, `ShoppingItemRow`, create-store-type UI, defaults learning | ~300 |
| 5 | Recipe entry points: `RecipeDetail` button + portion prompt, `RecipeList` multi-select | ~280 |
| 6 | `planificador/` weekly planner | ~320 |

Slice 1 ships dormant schema; slice 2 is unreferenced library code; slice 3 is a working loose-item list; 4–6 are additive surfaces.

## Open Questions

- [x] Store-type attachment point — RESOLVED, Decision 1 (`shopping_list`-owned, not `recipes.ingredient_catalog`).
- [x] Optional cost on loose manual items — RESOLVED, Decision 2 (one shared nullable column, snapshotted).
- [ ] Weekly-planner slot persistence: slots need *some* storage (`shopping_list.planner_slots` is the natural home) — but the spec forbids the planner holding checkable state. `sdd-tasks` must scope slice 6's table to `(household_id, day, meal_slot, recipe_id)` only, with no item/checked columns.
