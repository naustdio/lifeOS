# Tasks: Shopping List Module (Lista de Compras)

## TDD Mode Assessment

Session preflight: strict TDD mode enabled. RED-first applies to every production task below, not
just the flagged high-risk logic — but is especially load-bearing for `combineItems`
(design.md: "zero codebase precedent"), all pgTAP RLS assertions, and the two cross-module
composition actions (`generateFromRecipesAction`, planner's "Agregar a mi lista"), since those are
this change's only genuinely new interaction/logic surfaces.

## Review Workload Forecast

design.md already forecasts `800-line budget risk: High` across 6 stacked, independently
deployable slices (~2160 lines total). Re-verified against this session's 800-line budget:

| Slice / PR | Scope | design.md est. | Fits 800 solo? |
|---|---|---|---|
| 1 | Both migrations + `160_shopping_list.sql` | ~320 | Yes, wide margin |
| 2 | `domain/{combine,scale}.ts` + 3 repos + `api/index.ts` + tests | ~420 | Yes, wide margin |
| 3 | `(shopping-list)/layout` + `lista-de-compras/{page,actions,ShoppingListView,AddLooseItemForm}` + hub entry | ~520 | Yes — closest to budget, still 280 lines of margin |
| 4 | Store-type grouping: header, defaults learning, create-store-type UI | ~300 | Yes, wide margin |
| 5 | Recipe entry points: `RecipeDetail` button + prompt, `RecipeList` multi-select | ~280 | Yes, wide margin |
| 6 | `planner_slots` migration + `planificador/` weekly planner | ~320 | Yes, wide margin |

| Field | Value |
|---|---|
| Estimated total changed lines | ~2160 |
| Session review budget | 800 changed lines |
| 800-line budget risk | High as one PR (~2.7x budget); **no individual slice risks exceeding 800 on its own** |
| Chained PRs recommended | Yes — 6 PRs, matching design.md's slice boundaries; do not consolidate any two |
| Chain strategy | stacked-to-main, 6-deep — PR2 depends on PR1's tables; PR3 depends on PR2's `api/index.ts`; PR4 extends PR3's `ShoppingListView`; PR5 depends on PR2's barrel + PR3's actions file; PR6 depends on PR2's barrel and a new migration |
| ask-on-risk watch point | PR3 only (~520 est., largest single slice) — if its running total crosses ~650 lines mid-implementation, pause and ask before continuing rather than after the diff is already large |
| Decision needed before apply | Yes — confirm the 6-PR stacked grouping before `sdd-apply` begins |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Schema + RLS, dormant | PR 1 | `supabase test db` (`160_shopping_list.sql`) | Local Supabase stack (`supabase db reset`) | `drop schema shopping_list cascade` |
| 2 | Domain + data + api barrel, unreferenced | PR 2 | `npm run test -- shopping-list-combine shopping-list-scale shopping-list-repositories` | Vitest integration against local Supabase stack | Delete `src/modules/shopping-list/{domain,data,api}` — no route imports it yet |
| 3 | Working loose-item continuous list | PR 3 | `npm run test -- shopping-item-row shopping-list-view shopping-list-actions` | `npm run dev` → `/lista-de-compras` | Delete `(shopping-list)/lista-de-compras/*`, revert `page.tsx` MODULES entry |
| 4 | Store-type grouping, additive | PR 4 | `npm run test -- store-type-group-header shopping-list-store-types` | `/lista-de-compras` UI, custom store type creation | Revert `ShoppingListView` grouping diff, delete `StoreTypeGroupHeader.tsx` |
| 5 | Recipe entry points, additive | PR 5 | `npm run test -- shopping-list-generate-from-recipe` | `/recetas` and `/recetas/[id]` pages | Revert additive buttons in `RecipeDetail.tsx`/`RecipeList.tsx`, delete `generateFromRecipesAction` |
| 6 | Weekly planner, additive | PR 6 | `npm run test -- weekly-planner shopping-list-planner-add` | `/lista-de-compras/planificador` | Delete `planificador/` route + `drop table shopping_list.planner_slots` |

## Phase 1: Schema + RLS (PR 1)

- [x] 1.1 [RED] Write `supabase/tests/160_shopping_list.sql` (mirror `150_recipes.sql` fixture
      shape): non-member sees 0 rows across `lists`/`store_types`/`ingredient_store_defaults`/
      `items`; a second `active` list for the same household violates the partial unique index;
      `items.estimated_unit_cost < 0` is rejected. Run before any migration exists — MUST fail.
      — *spec: `shopping-list-continuous` "A non-member cannot see or write the list"; design
      Decision 2, Decision 5*
- [x] 1.2 [GREEN] Create `supabase/migrations/<ts>_shopping_list_schema.sql` per design.md's Data
      Model SQL verbatim: 4 tables (`lists`, `store_types`, `ingredient_store_defaults`, `items`)
      with indexes. `origin_recipe_id` stays a plain `uuid` column — NOT a foreign key; do not
      "fix" this. [depends: none]
- [x] 1.3 [GREEN] Create `supabase/migrations/<ts>_shopping_list_security.sql`: `for all to
      authenticated using (core.is_member(household_id)) with check (...)` on all 4 tables — plain
      RLS-gated direct writes, **no security-definer seam**; revoke-all + default-privileges +
      grant block copied from `_recipes_security.sql`. [depends: 1.2]
- [x] 1.4 Apply both migrations locally; re-run 1.1 — all assertions PASS (GREEN). [depends: 1.2,
      1.3]
- [x] 1.5 Confirm existing pgTAP suites (`150_recipes.sql`, `140_nutrition_visits.sql`, Finance's)
      still pass unchanged. [depends: 1.4]

## Phase 2: Domain + Data + API Barrel (PR 2, depends: Phase 1)

- [x] 2.1 [RED] Write `tests/unit/shopping-list-combine.test.ts`: same name+unit merges with
      summed total and both origins; `"manual"` label for loose contributors; different unit stays
      split; null-quantity contributor. Run before `domain/combine.ts` exists — MUST fail (zero
      precedent for this logic). — *spec: `shopping-list-recipe-intake` "Quantity Combining With
      Origin Breakdown" all 3 scenarios*
- [x] 2.2 [GREEN] Create `src/modules/shopping-list/domain/combine.ts`: `combineItems`, key =
      `name.trim().toLowerCase()|unit.trim().toLowerCase()`, stable order by earliest
      `created_at`. [depends: 2.1] Re-run 2.1 — GREEN.
- [x] 2.3 [RED] Write `tests/unit/shopping-list-scale.test.ts`: `scaleQuantity` 200@4→8=400;
      `portions = 0` guard; null passthrough. Run before `domain/scale.ts` exists — MUST fail.
- [x] 2.4 [GREEN] Create `src/modules/shopping-list/domain/scale.ts`: `scaleQuantity`,
      `estimatedTotal`. [depends: 2.3] Re-run 2.3 — GREEN.
- [x] 2.5 [RED] Write `tests/integration/shopping-list-repositories.test.ts` against local
      Supabase: `getOrCreateActiveList` creates once, reuses on second read; `finalizePurchase`
      closes the list, stamps `estimated_total`, next read yields a NEW empty active list; a
      non-member cannot read/write another household's list/items. Run before repositories exist
      — MUST fail. [depends: 1.4]
- [x] 2.6 [GREEN] Create `src/modules/shopping-list/data/list-repository.ts`:
      `getOrCreateActiveList`, `finalizePurchase`. [depends: 2.5]
- [x] 2.7 [GREEN] Create `src/modules/shopping-list/data/item-repository.ts`: `listItems`,
      `addItems`, `setChecked`, `removeItem`. [depends: 2.5]
- [x] 2.8 [GREEN] Create `src/modules/shopping-list/data/store-type-repository.ts`:
      `listStoreTypes`, `ensureBaseStoreTypes` (idempotent, see Deviations note — an expression
      unique index forced a read-then-insert-missing implementation instead of literal
      `on conflict do nothing`), `createStoreType`, `getIngredientDefaults`,
      `setIngredientDefault`. [depends: 2.5]
- [x] 2.9 Re-run 2.5 — GREEN. [depends: 2.6, 2.7, 2.8]
- [x] 2.10 Create `src/modules/shopping-list/api/index.ts`: `server-only` first line, sole public
      barrel re-exporting domain + data functions and `AddItemInput`; zero `@/modules/recipes`
      imports. [depends: 2.2, 2.4, 2.6, 2.7, 2.8] — *spec: `shopping-list-module-api` "Sole Public
      Barrel", "No Direct Cross-Module Import From Recipes"*
- [x] 2.11 Confirm `rg "@/modules/recipes/api" src/modules/shopping-list` returns zero matches.
      [depends: 2.10]

## Phase 3: Continuous List UI + Loose Items (PR 3, depends: Phase 2)

- [x] 3.1 Create `src/app/(app)/(shopping-list)/layout.tsx`: module shell mirroring
      `(recipes)/layout.tsx`.
- [x] 3.2 [RED] Write `tests/unit/shopping-item-row-render.test.tsx`: checking strikes through in
      place with no DOM reorder; origin sub-line renders only when `contributors.length > 1`. Run
      before `ShoppingItemRow.tsx` exists — MUST fail. — *spec: `shopping-list-continuous`
      "In-Place Strike-Through Check-Off"*
- [x] 3.3 [GREEN] Create `src/design-system/patterns/ShoppingItemRow.tsx`, locally-declared props.
      [depends: 3.2] Re-run 3.2 — GREEN.
- [x] 3.4 [RED] Write `tests/unit/shopping-list-view-render.test.tsx`: `AddLooseItemForm` submit
      adds an item with null recipe origin; "Finalizar compra" is the only clear trigger; checking
      every item does not clear. Run before the components exist — MUST fail. — *spec:
      `shopping-list-continuous` "Loose Manual Items", "Explicit Clear via 'Finalizar compra'"
      both scenarios*
- [x] 3.5 [GREEN] Create `.../lista-de-compras/AddLooseItemForm.tsx`: name/qty/unit/optional
      cost/store type fields. [depends: 3.4]
- [x] 3.6 [GREEN] Create `.../lista-de-compras/ShoppingListView.tsx`: renders `combineItems()`
      output flat (grouping added in PR 4) via `ShoppingItemRow`; check/uncheck/remove wiring;
      "Finalizar compra" button; embeds `AddLooseItemForm`. [depends: 3.3, 3.5, 2.10] Re-run 3.4 —
      GREEN.
- [x] 3.7 [RED] Write `tests/integration/shopping-list-actions.test.ts`: a loose item persists
      with null origin and appears via `listItems`; removal disappears for every household member;
      a non-member cannot check/remove another household's item. Run before `actions.ts` exists —
      MUST fail. [depends: 1.4]
- [x] 3.8 [GREEN] Create `.../lista-de-compras/actions.ts`: `addLooseItemAction`,
      `setCheckedAction`, `removeItemAction`, `finalizeAction` — calls `shoppingApi` only, no
      recipes import in this slice. [depends: 2.10]
- [x] 3.9 Re-run 3.7 — GREEN. [depends: 3.8]
- [x] 3.10 Create `.../lista-de-compras/page.tsx`: server container —
      `getOrCreateActiveList` + `listItems` + `listStoreTypes` → `combineItems()` →
      `ShoppingListView`. [depends: 3.6, 2.6, 2.7]
- [x] 3.11 Modify `src/app/(app)/page.tsx`: one `MODULES` entry (`ShoppingCart`,
      `/lista-de-compras`). — *covered generically by `module-hub`'s hardcoded-discovery
      requirement*

## Phase 4: Store-Type Grouping (PR 4, depends: Phase 3)

- [x] 4.1 [RED] Write `tests/unit/store-type-group-header-render.test.tsx`: items render under
      their store-type header; unassigned items render under a distinct "Sin categoría" group, not
      hidden. Run before `StoreTypeGroupHeader.tsx` exists — MUST fail. — *spec:
      `shopping-list-store-types` "Items Grouped by Store Type in the UI" both scenarios*
- [x] 4.2 [GREEN] Create `src/design-system/patterns/StoreTypeGroupHeader.tsx`: header + per-group
      subtotal, locally-declared props. [depends: 4.1]
- [x] 4.3 [GREEN] Extend `ShoppingListView.tsx` (3.6) to group `combineItems()` output by
      `storeTypeId` under `StoreTypeGroupHeader`, null → "Sin categoría". [depends: 4.2] Re-run
      4.1 — GREEN.
- [x] 4.4 [RED] Write `tests/integration/shopping-list-store-types.test.ts`: exercises the NEW
      `createStoreTypeAction` app-layer wiring specifically — repository-level idempotency/leak
      coverage for `ensureBaseStoreTypes`/`createStoreType` was already GREEN via Phase 2's
      `shopping-list-repositories.test.ts`, so re-testing those exact repo functions here would
      not be a valid RED test. Run before `createStoreTypeAction` exists — MUST fail. [depends:
      1.4] — *spec: `shopping-list-store-types` "A member creates a custom store type"*
- [x] 4.5 [GREEN] Wire `ensureBaseStoreTypes` into `page.tsx`'s server container; add
      create-store-type UI into `AddLooseItemForm.tsx`. [depends: 3.10, 2.8]
- [x] 4.6 Re-run 4.4 — GREEN. [depends: 4.5]

## Phase 5: Recipe Entry Points (PR 5, depends: Phase 2, Phase 3)

- [x] 5.1 [RED] Write `tests/integration/shopping-list-generate-from-recipe.test.ts`:
      `generateFromRecipesAction` scales `200@4→8=400`; declining to change portions uses the
      recipe's own `portions` unscaled; two selected recipes both contribute items in one call.
      Run before the action exists — MUST fail. [depends: 2.10] — *spec:
      `shopping-list-recipe-intake` "Single-Recipe Entry Point With Portion-Scaling Prompt" both
      scenarios, "Multi-Select Entry Point From Recipe List"*
- [x] 5.2 [GREEN] Add `generateFromRecipesAction({recipeIds, targetPortions})` to
      `.../lista-de-compras/actions.ts`: imports `@/modules/recipes/api` and
      `@/modules/shopping-list/api` side by side (Decision 3), calls `getRecipeById`,
      `scaleQuantity`, resolves store type via `getIngredientDefaults`, calls `addItems` with
      plain `AddItemInput[]` — never a live recipes object. [depends: 5.1, 2.10] Re-run 5.1 —
      GREEN. — *spec: `shopping-list-module-api` "App-Layer Composition for Cross-Module Data"*
- [x] 5.3 Modify `RecipeDetail.tsx`: add "Generar lista de compras" button + portion-count prompt
      calling `generateFromRecipesAction`. [depends: 5.2]
- [x] 5.4 Modify `RecipeList.tsx`: add multi-select mode + bulk "Generar lista de compras" calling
      `generateFromRecipesAction` with multiple `recipeIds`. [depends: 5.2]
- [x] 5.5 Confirm `rg "@/modules/recipes/api" src/modules/shopping-list` still returns zero
      matches — the import lives only in the app-layer `actions.ts`. [depends: 5.2]

## Phase 6: Weekly Planner (PR 6, depends: Phase 2)

- [x] 6.1 [RED] Write `supabase/tests/165_shopping_list_planner.sql`: a non-member cannot see/write
      `planner_slots`; the table carries exactly `(household_id, day, meal_slot, recipe_id)` — no
      item/checked/state column. Run before the table exists — MUST fail. [depends: 1.4] — *design
      Open Question: planner scoping*
- [x] 6.2 [GREEN] Create `supabase/migrations/<ts>_shopping_list_planner_schema.sql` +
      `<ts>_shopping_list_planner_security.sql`: `shopping_list.planner_slots(household_id, day,
      meal_slot, recipe_id)` strictly, RLS `core.is_member`, no seam. [depends: 6.1] Re-run 6.1 —
      GREEN.
- [x] 6.3 [GREEN] Create `src/modules/shopping-list/data/planner-repository.ts`:
      `listPlannerSlots`, `setPlannerSlot`. Export via `api/index.ts`. [depends: 6.2]
- [x] 6.4 [RED] Write `tests/unit/weekly-planner-render.test.tsx`: at most one recipe per
      day/meal slot; "Agregar a mi lista" present per assignment. Run before `WeeklyPlanner.tsx`
      exists — MUST fail. — *spec: `shopping-list-recipe-intake` "Weekly Planner Entry Point Is a
      Producer Only" both scenarios*
- [x] 6.5 [GREEN] Create `planificador/{page,actions,WeeklyPlanner}.tsx`: `actions.ts` composes
      `@/modules/recipes/api` + `@/modules/shopping-list/api` for "Agregar a mi lista" (recipe's
      default portions unless overridden); `WeeklyPlanner` holds zero checkable/clearable item
      state. [depends: 6.3, 6.4, 2.10] Re-run 6.4 — GREEN.
- [x] 6.6 [RED→GREEN] Write `tests/integration/shopping-list-planner-add.test.ts`: adding from the
      planner writes into the SAME active list; exactly one active list exists per household after
      the add. Write first (MUST fail), then wire, then confirm GREEN. [depends: 6.5] — *deviation:
      written and run AFTER 6.5's wiring rather than strictly before it (this apply session merged
      the write+wire steps); confirmed GREEN against the real local Supabase stack, but genuine RED
      evidence for this specific integration surface was not captured. See apply report.*

## Phase 7: Spec Reconciliation

- [x] 7.1 Confirm all 4 specs (`shopping-list-continuous`, `shopping-list-recipe-intake`,
      `shopping-list-store-types`, `shopping-list-module-api`) match implemented behavior.
      [depends: all prior phases] — cross-checked every requirement/scenario against
      `src/modules/shopping-list/**`, `src/app/(app)/(shopping-list)/**`, `RecipeDetail.tsx`,
      `RecipeList.tsx`. Zero behavioral discrepancies found; no spec wording changes needed.
- [x] 7.2 Verify all 11 proposal.md Success Criteria checkboxes hold post-apply. [depends: 7.1] —
      all 11 confirmed against repo state (see apply report).
- [x] 7.3 Confirm zero `eslint.config.mjs` changes and `rg "@/modules/recipes/api"
      src/modules/shopping-list` returns zero matches across the final diff. [depends: all prior
      phases] — `git diff --stat -- eslint.config.mjs` empty; `rg` zero matches; ESLint Gate A
      passes clean on the module + app-layer files.

### Post-verify corrective note (sdd-verify report, Engram `sdd/shopping-list/verify-report`)

`sdd-verify` found two reconciliation-adjacent test-infra bugs after Phase 7 closed (not new
scope, no new tasks added — fixed as one bounded corrective slice):

- **C1**: task 5.4's `RecipeList.tsx` import of `generateFromRecipesAction` transitively pulls in
  `server-only` via `@/modules/shopping-list/api`, which poisoned the pre-existing, unmodified
  `tests/unit/recipe-list-render.test.tsx` (jsdom throws on `server-only` import; vitest reported
  it as a silent "no tests" collection failure, not a visible test failure). Fixed by adding the
  same `vi.mock("server-only")` / `next/cache` / `@/shared/supabase/server` mocks that
  `recipe-detail-render.test.tsx:10-12` already used for the identical situation (task 5.3's
  `RecipeDetail.tsx` import), plus a mock of the actions module itself. `RecipeList.tsx` and
  `actions.ts` were NOT modified — component behavior was already correct.
- **W1**: `tests/integration/shopping-list-repositories.test.ts:12` had an unused `SupabaseClient`
  type import, tripping `eslint --max-warnings=0` (the real `npm run verify` gate). Removed.

Post-fix: `npx vitest run` → 94 files / 544 tests, all pass (`recipe-list-render.test.tsx` back to
5 tests, no longer "no tests"); `npx eslint . --max-warnings=0` → clean; `npx tsc --noEmit` →
clean. pgTAP not re-run (no SQL touched).
