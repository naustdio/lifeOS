# Exploration: Lista de Compras (Shopping List) module

## Current State

**recipes.recipes** (`supabase/migrations/20260813090039_recipes_schema.sql` + later additions): `id, household_id, owner_user_id, title, category, portions int (1-99), video_url, is_deleted, prep_minutes, description, photo_path, created_at, updated_at`. RLS: plain `core.is_member(household_id)`, no visibility branch — recipes have no sensitivity dimension per module's own design doc.

**recipes.recipe_ingredients**: `id, recipe_id, position, name, quantity numeric(10,2) nullable ("al gusto"), unit text, sub_recipe_id uuid nullable (FK to a 'complemento' recipe, set null on delete), estimated_unit_cost numeric(10,2) nullable, check estimated_unit_cost >= 0`. `estimated_unit_cost` was added in `20260817223200_recipes_ingredient_cost.sql`, whose own header comment explicitly calls it "Foundation for a future ShoppingList module (a shared cart would sum these across recipes)" — confirms this was anticipated.

**recipes.custom_units** (`household_id, unit_name, created_at`, PK `(household_id, unit_name)`): the exact open-taxonomy template to mirror for store-type. Populated ONLY inside the write-seam functions (`create_recipe`/`update_recipe`) via `on conflict do nothing` when a used unit isn't in the builtin list (`recipes.is_builtin_unit`). Read-only repository (`custom-unit-repository.ts`) — one function, `listCustomUnits`. No direct-insert RLS policy exists for this table; it's populated purely as a seam side-effect, unlike `ingredient_catalog` below.

**recipes.ingredient_catalog** (`20260814140000_recipes_ingredient_catalog.sql`): `id, household_id, name, photo_path, icon, created_at, updated_at`, unique index on `(household_id, lower(name))`. Explicitly documented as NOT seam-only: household members can INSERT/UPDATE it directly under RLS (`ingredient_catalog_select/insert/update` policies gated by `core.is_member`), because "a catalog entry carries no mandatory-reason audit requirement." The write seam (`create_recipe`/`update_recipe`) ALSO auto-upserts a bare entry (name only, `on conflict (household_id, lower(name)) do nothing`) for every ingredient used, so the catalog grows even for members who never touch it directly. This is the natural attachment point for a `store_type` tag if the design phase chooses option (a) or (c) from the open question — it already has direct-write RLS and per-household dedup by lowercased name, so adding a nullable `store_type_id`/`store_type` column + an update path would fit its existing shape with no new pattern needed.

**Portion scaling** (`src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx` lines 204-206, 219-222): purely display-side, never persisted.
```ts
const [targetPortions, setTargetPortions] = useState(recipe.portions);
const scaleRatio = recipe.portions > 0 ? targetPortions / recipe.portions : 1;
...
const estimatedTotalCost = recipe.ingredients.reduce((sum, i) => {
  if (i.quantity === null || i.estimatedUnitCost === null) return sum;
  return sum + i.quantity * scaleRatio * i.estimatedUnitCost;
}, 0);
```
Rendered scaled quantity: `i.quantity * scaleRatio` fed into `formatScaledQuantity(...)`. This exact formula (`targetPortions / recipe.portions`, applied as `quantity * scaleRatio`) is what a shopping-list "add recipe at N portions" action should reuse verbatim.

**Nav registration** (`src/app/(app)/page.tsx`): a flat `MODULES: ModuleItem[]` array (label, icon, href) rendered by `ModuleGrid`. Comment: "Adding a module is one new `MODULES` entry, never a dynamic registry." Currently: Finanzas, Salud, Recetas. Adding Lista de Compras is a one-line addition here — trivial, no risk.

**recipes-module SDD artifacts still live** (not archived) at `openspec/changes/recipes-module/{proposal,design,tasks,exploration}.md` and `specs/{recipes-video-reference,recipes-catalog,recipes-history}/spec.md`. Confirms earlier session note; the shopping-list proposal should follow this same file/spec shape for consistency (proposal.md, design.md, tasks.md, specs/\<slice\>/spec.md).

## Cross-module read pattern — IMPORTANT DEVIATION FROM THE ASSUMED PATTERN

Verified `eslint.config.mjs`'s `boundaries/element-types` rules directly (Gate A). The actual enforced rule for `from: "module-api"` only allows importing `["module-domain", {module: "${from.module}"}]`, `["module-data", {module: "${from.module}"}]`, and `"shared"` — i.e. a module's own domain/data plus shared code. There is NO rule permitting one module's `api/index.ts` to import another module's `api/index.ts`. Grepping the entire `src/modules/**` tree for `from "@/modules/(finance|recipes|health)/api"` inside module code returned zero matches — confirmed empirically, not just from the lint config.

The rule that DOES allow cross-module api imports is `from: "module-ui"`, which lists bare `"module-api"` (no module capture restriction) — but `src/modules/*/ui/` currently contains only empty `.gitkeep` placeholders (core and finance) and is not used by any real code.

**The actual established cross-module composition pattern lives entirely at the `app` layer**, not module-to-module: e.g. `src/app/(app)/(health)/nutricion/actions.ts` imports `* as healthApi from "@/modules/health/api"` AND `{ findByOrigin, recordTransaction, voidTransactionById } from "@/modules/finance/api"` side by side, and orchestrates both from the Server Action. `src/app/(app)/(health)/salud/page.tsx` similarly imports `listEvents` from health/api and `listActiveAccounts, listActiveCategories` from finance/api directly in the page component.

**Implication for shopping-list**: if the new module's own `api/index.ts` (or its actions.ts) needs to read `recipes.recipe_ingredients` data, under the CURRENT lint boundary it cannot import `@/modules/recipes/api` directly from inside `src/modules/shopping-list/**` (any layer) — that import would fail `boundaries/element-types`. Design will need to choose one of: (a) do the recipe-read composition at the `app` layer's actions.ts (mirroring nutricion's health+finance precedent) rather than inside the shopping-list module itself, or (b) add a new explicit boundary-rule exception (a new Gate A carve-out, analogous to Gate B's finance-dependency-direction rule) permitting `module-api → module-api` for this one dependency, which would be a deliberate, documented deviation from the existing convention. This is a real fork with a concrete precedent for option (a) and zero precedent for option (b) — flagging for the design phase, not resolving it here.

## Finance link — schema already anticipates this

`src/modules/finance/api/index.ts` already defines:
```ts
export type OriginModule = "manual" | "shopping_list" | "car_control" | "recurring" | "health";
```
`"shopping_list"` is ALREADY a listed origin-module value (present before this exploration — not something to add). `OriginRefSchema = { householdId, module: enum(...), entityId }` backs `recordTransaction`/`recordTransfer` (`origin: OriginRefSchema.pick({module:true, entityId:true})`), plus `findByOrigin`, `updateOriginTransaction`, `voidTransaction` (by origin) as the existing origin-linking seam (same pattern health's nutrition visits use to post/void a linked finance transaction). This means: the deferred future Finance link for shopping-list has a ready-made mechanism already shipped in Finance — a future "mark as purchased, log an expense" action would call `recordTransaction({..., origin: {module: "shopping_list", entityId: <list-or-checkout-id>}})`. Nothing needs to change in Finance's schema for this later integration; the shopping-list module's own schema just needs a stable numeric total-cost value and some identifier (e.g. a "checkout" or "session" id) it can hand off as `entityId` when that later work happens. No blocker found.

## Write-seam convention (security definer vs. direct RLS)

Two co-existing precedents in this same module:
1. **`recipes.recipes`/`recipe_ingredients`/`recipe_steps`**: written ONLY via `security definer` functions `create_recipe`/`update_recipe` (`perform core.assert_member(p_household_id)` then multi-table writes + an audit-trail insert into `recipe_changes` with a mandatory `reason`). This is for content that needs a reasoned audit trail (soft/hard delete, edits).
2. **`recipes.ingredient_catalog`, `recipes.custom_units`, `recipes.recipe_favorites`**: plain RLS-gated direct writes, no seam function, explicitly reasoned in each migration's header comment as "no mandatory-reason audit trail makes sense for this."

Given the task's stated requirements (any household member can add/check/remove items freely, no reason/audit trail requirement mentioned anywhere), the shopping-list item table(s) fit precedent #2 — plain `core.is_member(household_id)` RLS-gated direct writes, no security-definer seam, matching `ingredient_catalog`'s reasoning exactly. A security-definer seam would only be warranted if a later requirement introduces reasoned audit needs (there is none today). This mirrors `recipe_favorites`'s explicit call-out: "No write-seam function: same direct-write-under-RLS reasoning as `recipes.ingredient_catalog`."

Also relevant: `recipe_favorites` is the one RECENTLY-added per-user (not household-shared) RLS pattern (`user_id = auth.uid()` on SELECT/DELETE) — the user has already confirmed shopping-list should NOT copy this shape; it should be plain household-shared like `recipe_ingredients`/`ingredient_catalog` (`core.is_member(household_id)` on all policies, no per-user column).

## Combine-with-origin-breakdown UI pattern

No existing precedent found anywhere in the codebase for a "combine same-name+unit items from multiple sources into one summed line with a secondary per-origin breakdown" UI. Searched recipes and finance UI for anything resembling grouped/aggregated line items with sub-breakdowns (finance has category trees and budget progress bars, health has vitals trends — none combine multiple sources into one summed row with a breakdown). This is genuinely new UI/interaction work for the design phase, not a reuse case.

## Open design question (explicitly not resolved here)

How does an ingredient/item get a "tipo de tienda" (store-type)? `recipes.ingredient_catalog` is the natural per-household home for this (already has direct-write RLS, already dedups by lowercased name, already grows automatically via the write seam) if the design wants it to "learn" across the whole household rather than being tagged per-list-item. Tagging directly on the shopping-list item row is simpler but doesn't generalize. A hybrid (store on catalog, but let a list item override) is also structurally possible given catalog's existing shape. Flagging for `sdd-propose`/`sdd-design` to decide — not resolving here per task instructions.

## Affected Areas

- `supabase/migrations/` — new `shopping_list` schema (items table, store-type taxonomy table, possibly a `custom_units`-style open store-type table)
- `src/modules/shopping-list/` (new) — data/domain/api layers for the new module
- `src/app/(app)/page.tsx` — one new `MODULES` entry
- `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx` — read for the exact portion-scaling formula to replicate; likely gets a new "Generar lista de compras" button
- `src/app/(app)/(recipes)/recetas/RecipeList.tsx` / `page.tsx` — multi-select entry point
- `src/modules/recipes/data/recipe-repository.ts` — `getRecipeById`, `listIngredientNamesByRecipeIds` are the read shapes a shopping-list add-from-recipe action will consume
- `src/modules/recipes/data/custom-unit-repository.ts` — template for the store-type open-taxonomy repository
- `src/modules/recipes/data/ingredient-catalog-repository.ts` — template AND likely literal attachment point for store-type
- `src/modules/finance/api/index.ts` — `OriginModule`/`OriginRefSchema`/`recordTransaction`/`findByOrigin` are the ready-made (unbuilt-for-shopping-list-yet) seam for the deferred Finance link
- `eslint.config.mjs` — Gate A boundary rules govern whether/how shopping-list can read recipes' api; currently no module-api-to-module-api rule exists

## Approaches (cross-module read boundary — the one real fork)

1. **App-layer composition (mirrors existing nutricion precedent)** — shopping-list's own `api/index.ts` never imports `@/modules/recipes/api`; instead the `app` route's Server Action/page imports both `@/modules/shopping-list/api` and `@/modules/recipes/api` and passes recipe data into the shopping-list write function as plain arguments.
   - Pros: zero ESLint boundary changes needed, matches the one concrete precedent that exists today (health+finance in nutricion actions.ts)
   - Cons: shopping-list's "generate from recipe" logic (portion scaling, quantity extraction) partly lives in app-layer code rather than being encapsulated in the module, slightly diffuses responsibility
   - Effort: Low

2. **New Gate A carve-out permitting `module-api → module-api` for this one dependency** — add an explicit eslint-plugin-boundaries exception letting `shopping-list`'s api import `recipes`'s api directly.
   - Pros: keeps recipe-reading logic encapsulated inside the shopping-list module itself, closer to what the task description assumed
   - Cons: a genuinely new architectural precedent with no existing example to copy; needs its own justification and likely its own "Gate A carve-out" doc comment (similar weight to Gate B's finance-dependency-direction rule); touches shared `eslint.config.mjs`
   - Effort: Medium

### Recommendation

Approach 1 (app-layer composition) is lower-risk and requires zero changes to the shared lint boundary config, but this is exactly the fork flagged for `sdd-propose`/`sdd-design` since the task's "real read-dependency on `@/modules/recipes/api`" framing assumed approach 2 was already the convention, which Gate A verification shows it is not.

## Risks

- The assumption that "cross-module reads happen via module A importing module B's `api/index.ts`" is not actually the current enforced pattern — flagged above as a fork requiring an explicit decision in `sdd-propose`/`sdd-design`, not a blocker but a real design choice with lint-config consequences either way.
- Store-type taxonomy attachment point (item-row vs. `ingredient_catalog` vs. both) is unresolved by design — needs a `sdd-propose`/`sdd-design` decision, not an implementation blocker but affects schema shape from the start.
- No existing UI precedent for "combine + origin breakdown" — genuinely new interaction design work, moderate effort risk for the design/tasks phases, not a blocker.
- None of the above block feasibility; all three are open decisions to carry into design, not technical obstacles.

## Ready for Proposal

Yes — enough concrete file/schema/pattern grounding exists to proceed to `sdd-propose`. Three real open decisions were surfaced (cross-module read boundary approach, store-type attachment point, and that "combine + breakdown" UI is new work with no reusable precedent) — none block proceeding, but `sdd-propose`/`sdd-design` should address all three explicitly rather than defaulting silently.
