# Proposal: Shopping List Module (Lista de Compras)

## Intent

Recipes now hold structured ingredients, units, and `estimated_unit_cost`, but there is no way to turn "what we plan to cook" into "what we buy". Today the household re-derives the grocery list by hand from several recipe screens, loses track of duplicated ingredients, and has no estimated spend before entering the store. This change adds `shopping-list` as a fifth peer module: one continuous household list fed by recipes and by loose manual items, grouped by store type, with combined quantities and an estimated total.

**Scope note:** every decision below was settled in a multi-round requirements interview with the user. They are recorded as settled, not re-opened.

## Scope

### In Scope

- **One continuous list per household.** Not multiple named/dated lists. An explicit **"Finalizar compra"** button clears it — never auto-clear when all items are checked.
- **Items from recipes OR loose manual items** not tied to any recipe.
- **No owner-only restriction.** Any member may add, check, or remove items. No mandatory-reason audit trail.
- **Three entry points, all feeding the SAME continuous list:**
  1. "Generar lista de compras" on recipe detail (`/recetas/[id]`).
  2. Multi-select of several recipes on `/recetas`, then generate.
  3. A **weekly planner** (one recipe per day/meal slot) with an "Agregar a mi lista" button. The planner is a producer, not a second list system.
- **Portion scaling on add.** Ask "for how many portions" and reuse the existing `RecipeDetail.tsx` formula verbatim: `scaleRatio = targetPortions / recipe.portions`, applied as `quantity * scaleRatio`.
- **Quantity combining.** Same ingredient name + same unit merges into one line with a summed total plus a smaller secondary origin breakdown (e.g. `500 g` primary, "300 g de Ensalada de pollo + 200 g de Tacos" sub-line). Different units for the same name stay separate lines — **no unit conversion**.
- **Estimated total cost** from each item's `estimated_unit_cost x quantity`, summed over items that have one. Loose manual items may carry their own optional cost field (lean yes for consistency; confirm in spec).
- **Store-type grouping**, an OPEN, household-scoped, user-extensible taxonomy — same shape as `recipes.custom_units`, **not a fixed enum**. Confirmed base set: Supermercado, Carniceria, Cremeria, "Mercado / Frutas y Verduras".
- **Check-off UX:** checking strikes the item through **in place**; no separate "purchased" section.
- Household-shared RLS via `core.is_member(household_id)` on every policy — explicitly NOT the per-user `recipe_favorites` shape.
- Plain RLS-gated direct writes (the `ingredient_catalog` / `custom_units` / `recipe_favorites` precedent). **No security-definer seam**, since no reasoned audit trail is required.
- One new entry in the flat `MODULES` array in `src/app/(app)/page.tsx`.

### Out of Scope

Each item was considered and explicitly deferred by the user:

- Notifications and reminders.
- Inline editing/overriding of a combined quantity total. v1 is checklist + loose items only.
- **Any actual Finance integration** — no account/category picker, no movement creation, no "mark as purchased -> log expense". See Dependencies: the schema must not block it.
- Recipe-module changes beyond reading data for entry points 1 and 2. No changes to recipe creation/editing flows.
- Multiple named or dated lists; per-user private lists; unit conversion.

## Capabilities

### New Capabilities

- `shopping-list-continuous`: the single household list — add/check/remove items, loose manual items, strike-through in place, "Finalizar compra" clearing, estimated total cost.
- `shopping-list-recipe-intake`: the three entry points (recipe detail, multi-select, weekly planner), portion scaling on add, and combined quantities with per-origin breakdown.
- `shopping-list-store-types`: the open, household-scoped, user-extensible store-type taxonomy and grouped rendering.
- `shopping-list-module-api`: the `shopping-list/api` barrel as sole cross-module entry point (Gate A), mirroring `recipes-module-api`.

### Modified Capabilities

- None. `module-hub`'s hardcoded-discovery requirement already covers adding a card; `module-architecture` is module-name-agnostic.

## Approach

**Settled architecture decision — app-layer composition (exploration Approach 1).** Verified empirically: the enforced ESLint Gate A `boundaries/element-types` rule permits a module's `api/` barrel to import only its own `domain`/`data` plus `shared`. There are zero module-to-module `api` imports in this codebase.

Therefore:

- `src/modules/shopping-list/**` (any layer) **MUST NEVER** import `@/modules/recipes/api`.
- Cross-module composition happens at the `app` layer, mirroring `src/app/(app)/(health)/nutricion/actions.ts` (which imports `@/modules/health/api` and `@/modules/finance/api` side by side). A Server Action under the new shopping-list route group imports **both** `@/modules/shopping-list/api` and `@/modules/recipes/api`, and passes **plain recipe/ingredient data as arguments** into the shopping-list write functions — never a live recipes-module object or class across the boundary.
- No `eslint.config.mjs` carve-out is needed and none should be added.

This decision is recorded here so later phases do not silently re-litigate it.

Schema-wise: a new `shopping_list` schema with a two-file migration split (DDL, then RLS/grants) as every prior module. Items are a flat relational table; combining is a **read/render-time aggregation** over item rows that retain their origin (recipe id + title, or `null` for loose items), so the origin breakdown is derivable and "Finalizar compra" is a single scoped delete/close.

### Store-type attachment point — recommendation (confirm in design)

The exploration left this open. **Recommendation: a household-scoped default mapping owned by the shopping-list module, plus a nullable per-item override.**

- `shopping_list.store_types` — open taxonomy (`household_id, name`), mirroring `recipes.custom_units`.
- `shopping_list.ingredient_store_defaults` — keyed by `(household_id, lower(ingredient_name))`, so the household "learns" the store type once and every future list inherits it.
- Nullable `store_type_id` on the item row as a per-item override.

Rationale: it learns across the household (the value of catalog attachment) **without** adding a column to `recipes.ingredient_catalog`, which would create a cross-schema dependency in the opposite direction of the app-layer composition decision above and would drag recipe-module changes into a scope we declared out of scope. **Flagged: `sdd-design` should confirm this before schema work; the alternative (tagging on `recipes.ingredient_catalog`) is viable but couples the two modules.**

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | `shopping_list` schema DDL + RLS/grants pair |
| `src/modules/shopping-list/domain/` | New | Combining, scaling, and total-cost predicates |
| `src/modules/shopping-list/data/` | New | Item, store-type, ingredient-default repositories |
| `src/modules/shopping-list/api/index.ts` | New | Sole public barrel, `server-only` first line |
| `src/app/(app)/(shopping-list)/` | New | Layout, list view, weekly planner, Server Actions (cross-module composition point) |
| `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx` | Modified | "Generar lista de compras" button + portion prompt |
| `src/app/(app)/(recipes)/recetas/RecipeList.tsx` | Modified | Multi-select entry point |
| `src/app/(app)/page.tsx` | Modified | One new `MODULES` entry |
| `src/design-system/patterns/` | New | Combined item row with origin sub-line, store-type group header |
| `eslint.config.mjs` | None | No carve-out — app-layer composition needs no boundary change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Combined scope far exceeds the 800-line review budget | High | `sdd-tasks` must forecast stacked slices (schema+RLS -> module data/domain -> list UI + loose items -> recipe entry points + scaling -> weekly planner -> store-type grouping) |
| "Combine + origin breakdown" has zero UI precedent in this codebase | Med | Genuinely new interaction work; design must specify the row anatomy explicitly before tasks |
| Store-type attachment recommendation is overturned in design | Med | Flagged above as an explicit confirmation gate before any migration is authored |
| Weekly planner quietly grows into a second list system | Med | Spec must state it is a producer only, with no persistence semantics of its own beyond slot assignment |
| Future Finance link blocked by schema shape | Low | See Dependencies — expose a stable total and a stable checkout/session id |
| Same ingredient name in different units confuses users | Low | Accepted: separate lines, no conversion; the origin sub-line makes the split legible |

## Rollback Plan

Revert the app commit and `drop schema shopping_list cascade`. Outside the new module the only touched files are `src/app/(app)/page.tsx` (one array entry), `RecipeDetail.tsx`, and `RecipeList.tsx` (additive entry-point buttons only) — all restorable by revert. No existing table, policy, RLS rule, or module contract is modified, so rollback cannot affect Core, Finance, Health, or Recipes data.

## Dependencies

- `core.households` / `core.household_members` / `core.is_member` — shipped.
- `recipes.recipe_ingredients` (`name`, `quantity`, `unit`, `estimated_unit_cost`) and `recipes.recipes.portions` — shipped; read at the app layer only.
- **Future-compatibility note (NOT work in this change):** `src/modules/finance/api/index.ts` already declares `OriginModule` including `"shopping_list"`, with `OriginRefSchema`, `recordTransaction`, and `findByOrigin` as a ready seam. Nothing in Finance needs to change later. To keep that door open, this module's schema MUST expose (a) a stable numeric total-cost value and (b) a stable identifier — e.g. a checkout/session id created by "Finalizar compra" — usable later as `entityId`. Design must not design this away; it must not build it either.

## Success Criteria

- [ ] A member generates a list from one recipe at N portions and every quantity equals `quantity * (N / recipe.portions)`.
- [ ] Adding a second recipe sharing an ingredient name and unit produces ONE line with the summed total and a secondary sub-line naming both source recipes.
- [ ] The same ingredient name with two different units renders as two separate lines; no conversion occurs.
- [ ] A loose manual item can be added, checked, and removed without any recipe involvement.
- [ ] Checking an item strikes it through in place; the list does not reorder and no "purchased" section appears.
- [ ] All three entry points write into the same single continuous list — never a new list.
- [ ] "Finalizar compra" is the only thing that clears the list; checking every item does not.
- [ ] A member can create a custom store type beyond the four base ones and see items grouped under it.
- [ ] The list shows an estimated total derived from `estimated_unit_cost x quantity`.
- [ ] `rg "@/modules/recipes/api" src/modules/shopping-list` returns zero matches.
- [ ] No Finance account/category picker, no transaction write, no notification code, and no `eslint.config.mjs` change appear in the diff.

## Delivery Notes (cached preflight)

Execution mode: interactive - Artifact store: hybrid - Delivery strategy: ask-on-risk - Review budget: 800 changed lines.

## Proposal question round

Core scope, entry points, scaling, combining, cost, grouping, check-off UX, and the cross-module boundary are all SETTLED by the user's interview and are NOT re-asked. One item remains open for `sdd-design` to confirm:

1. **Store-type attachment point** — recommended above as `shopping_list`-owned defaults + per-item override, rather than a `store_type` column on `recipes.ingredient_catalog`. Confirm before the migration is authored.
2. **Optional cost field on loose manual items** — proposal leans yes for consistency; confirm in spec.
