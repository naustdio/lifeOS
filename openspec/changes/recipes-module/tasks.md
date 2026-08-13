# Tasks: Recipes Module

## TDD Mode Assessment

Project `strict_tdd: false` (critical-logic focus, per `sdd-init/lifeos`). Per design.md's Testing
Strategy table and the session preflight, RED-first is scoped to the genuinely
load-bearing surfaces, not blanket TDD:

- **RED-first**: pgTAP (`150_recipes.sql` — non-member visibility leak, non-owner hard-delete
  `42501`, direct-insert-as-`authenticated` denial, `recipe_changes.reason` NOT NULL, hard-delete
  audit-row survival with `recipe_id is null` + title snapshot), the mandatory-reason seam
  atomicity (a blank-reason `create_recipe`/`update_recipe`/`soft_delete_recipe` call writes no
  recipe row), the owner-only hard-delete bypass (a non-owner server-action call is rejected, not
  only the RLS layer), cross-household isolation (a non-member cannot read another household's
  recipes or `custom_units`), and `resolveEmbed`'s `javascript:`/`data:` rejection (threat-matrix
  row).
- **Standard (extend-after)**: RTL component tests (`RecipeList` search/filter render,
  `RecipeDetail` collapsed-history default, video embed happy-path render) — these assert *what
  got built*, not a pre-existing bug, matching `nutrition-submodule`'s own Phase 4/7 precedent.

This is the **first from-scratch module** in this codebase's SDD history — no schema, no
`src/modules/recipes/`, no route group exist yet. Phase 1 therefore budgets explicit,
separately-reviewable tasks for each of the three migration files (DDL, `SECURITY DEFINER` seam,
RLS/grants — an extension of the two-file DDL+RLS precedent with a dedicated seam file per
Decision 1), and Phase 2/3 budget explicit first-time scaffolding tasks (`domain/`, `data/`,
`api/index.ts`, `(recipes)/layout.tsx`) rather than folding them silently into a single task the
way an extension of an existing module could.

## Review Workload Forecast (re-evaluated against this session's 800-line budget)

design.md's own forecast (`800-line budget risk: High`, five stacked slices summing to
~1780 lines) already used this session's real 800-line number, not a generic default — but it
computed each slice independently without stating a PR-grouping recommendation. Re-verifying the
per-slice estimates and adding that recommendation:

| Slice | Scope | design.md est. | Re-verified est. | Notes |
|---|---|---|---|---|
| 1 | 3 migration files (schema/seam/security) + `150_recipes.sql` | ~420 | ~450–480 | 4 `SECURITY DEFINER` functions with `jsonb` ingredient/step parsing are denser than a typical RLS-only file; pgTAP fixture setup (household/member impersonation) adds ~40–60 lines over a bare-policy suite |
| 2 | `domain/{recipe,unit}.ts` + 3 repositories + `api/index.ts` + unit/integration tests | ~330 | ~330–360 | Matches design.md; `mergeUnitOptions`/RPC wrappers are small, mechanical functions |
| 3 | `layout.tsx` + `recetas/{page,actions,RecipeList,RecipeForm}.tsx` + `IngredientRow`/`StepRow` + hub entry | ~520 | **~560–620** | Revised up: `RecipeForm` alone (dynamic add/remove ingredient AND step rows, unit picklist + custom-unit merge, mandatory reason field, category/portions/video_url fields) is the single densest component in the whole change — comparable to or larger than `RecurringForm.tsx`; `actions.ts` carries 4 distinct Server Actions each parsing `FormData` into the seam's `jsonb` shape |
| 4 | `recetas/[id]/{page,RecipeDetail}.tsx` — history section, soft/hard delete confirmations + integration tests | ~330 | ~330–360 | Matches design.md |
| 5 | `VideoEmbed.tsx` + `resolveEmbed` tests + detail/form wiring | ~180 | ~180–200 | Matches design.md |

| Field | Value |
|---|---|
| Estimated total changed lines | ~1850–2020 |
| Session review budget | 800 changed lines |
| 800-line budget risk | **High, confirmed** — total scope is ~2.3–2.5x the budget as a single PR; every individual slice stays safely under 800 on its own, so no slice needs an internal split, but **no two slices should be combined into one PR** |
| Chained PRs recommended | **Yes — 5 PRs, matching design.md's own 5-slice split, not consolidated** (unlike `nutrition-submodule`'s 3→2 regrouping: there the two app-layer slices shared no dependency-risk margin, but here slice 1+2 alone would total ~780–840 lines — already at or over budget before slice 3's app code is even touched, so consolidating any two of these five is unsafe) |
| Chain strategy | **stacked-to-main, 5-deep** — PR2 imports PR1's tables/RPCs; PR3 imports PR2's `api/index.ts` barrel; PR4 imports PR3's `RecipeDetail` shell (extends the same file) and PR2's history repository; PR5 wires into PR3's `RecipeForm` and PR4's `RecipeDetail`. None compiles or passes tests without its predecessor merged |
| ask-on-risk stop point | **PR3 (slice 3) only** — it is the sole slice whose re-verified estimate (~560–620) sits close enough to the 800 ceiling that a scope surprise (e.g. `RecipeForm` growing past estimate, or `IngredientRow`/`StepRow` needing more reorder-handle logic than expected) could push it over budget mid-implementation. `sdd-apply` should pause and ask before starting PR3 if the running total for that PR's files crosses ~700 lines. PR1, PR2, PR4, PR5 all have enough margin (200+ lines under budget each) that no mid-PR confirmation is expected |
| Decision needed before apply | **Yes** — confirm the 5-PR stacked grouping (matching design.md's slice boundaries) before `sdd-apply` begins, and confirm the PR3 stop-point threshold above |

## Phase 1: Schema, Security Seam, RLS (PR 1)

- [x] 1.1 [RED] Write `supabase/tests/150_recipes.sql` (mirror `140_nutrition_visits.sql`'s
      fixture/impersonation shape): assert (a) a non-member `select` on another household's
      `recipes.recipes`/`recipe_ingredients`/`recipe_steps`/`custom_units` returns 0 rows; (b) a
      non-owner calling `recipes.hard_delete_recipe` raises `42501`; (c) a direct
      `insert into recipes.recipes` as `authenticated` (bypassing the seam) is denied by the
      revoked grant; (d) `recipe_changes.reason` rejects null and blank/whitespace-only values;
      (e) `hard_delete_recipe` leaves the corresponding `recipe_changes` row(s) with
      `recipe_id is null`, the `household_id` and `recipe_title` snapshot intact, and the
      `hard_deleted` reason readable. Run before any migration exists — all assertions MUST fail
      (RED evidence). — *spec: `recipes-catalog` "Household-Shared Visibility"; `recipes-history`
      "Mandatory Reason Enforced at the Write Layer", "Owner-Only Hard Delete Enforced in RLS"*
- [x] 1.2 [GREEN] Create `supabase/migrations/<ts>_recipes_schema.sql` per design.md's Schema
      section: `create schema recipes`, the 5 tables (`recipes`, `recipe_ingredients`,
      `recipe_steps`, `recipe_changes`, `custom_units`) with their CHECK constraints and indexes,
      `core.touch_updated_at` trigger on `recipes.recipes`. Include the migration comment required
      by design.md Decision 2 stating the hard-delete asymmetry ("content is destroyed,
      accountability is not") directly above `recipe_changes.recipe_id`'s `on delete set null`.
      — *spec: `recipes-catalog` "Recipe Core Record", "Ordered Ingredients as Relational
      Children", "Ordered Numbered Steps as Relational Children", "Unit Input Uses a Persisted
      Picklist with Free-Text Fallback"*
- [x] 1.3 [GREEN] Create `supabase/migrations/<ts>_recipes_api.sql` per design.md's Interfaces
      section: the 4 `security definer set search_path = ''` seam functions
      (`create_recipe`, `update_recipe`, `soft_delete_recipe`, `hard_delete_recipe`), each opening
      with `perform core.assert_member(p_household_id)`; `hard_delete_recipe` additionally gates
      on `core.is_owner(...)` before deleting; ingredients/steps arrive as `jsonb` parameters and
      are inserted relationally; every mutation writes its `recipe_changes` row (with
      `recipe_title` snapshot) in the same transaction. [depends: 1.2] — *spec: `recipes-history`
      "Mandatory Reason Enforced at the Write Layer" (all three scenarios); Design Decision 1,
      Decision 2*
- [x] 1.4 [GREEN] Create `supabase/migrations/<ts>_recipes_security.sql` per design.md's RLS
      section: `recipes_select`/`recipes_delete` (the latter `using (core.is_owner(household_id))`
      per Decision 3), `recipe_ingredients_select`/`recipe_steps_select` via parent `exists`,
      `recipe_changes_select` (works after `recipe_id` goes null — scoped on the denormalized
      `household_id`), `custom_units_select`; revoke all DML/functions from `anon`/`authenticated`
      by default, grant `select` on all 5 tables and `execute` on the 4 seam functions.
      [depends: 1.2, 1.3] — *spec: `recipes-history` "Owner-Only Hard Delete Enforced in RLS"
      (all three scenarios); `recipes-catalog` "Household-Shared Visibility"*
- [x] 1.5 Apply the three migrations locally (`supabase db reset` or targeted apply); re-run
      `150_recipes.sql` — all assertions PASS (GREEN). [depends: 1.2, 1.3, 1.4]
- [x] 1.6 Confirm existing pgTAP suites (`120_health_rls.sql`, `130_nutrition_tracking.sql`,
      `140_nutrition_visits.sql`, Finance's suites) still pass unchanged — no regression, no
      cross-schema interference. [depends: 1.5]

## Phase 2: Domain + Data Layer + API Barrel (PR 2, depends: Phase 1)

- [x] 2.1 [RED] Write `tests/unit/recipe-domain.test.ts`: `isValidCategory` accepts exactly the
      5-value enum and rejects anything else; `reasonIsPresent` rejects null/empty/whitespace-only
      and accepts a real string; `normalizePositions` re-sequences a sparse/out-of-order position
      array to a contiguous 0-based sequence. Run before `domain/recipe.ts` exists — MUST fail
      (module not found). — *spec: `recipes-catalog` "Category is restricted to the fixed enum"*
- [x] 2.2 [GREEN] Create `src/modules/recipes/domain/recipe.ts`: `RECIPE_CATEGORIES`,
      `isValidCategory`, `reasonIsPresent`, `normalizePositions`. [depends: 2.1] Re-run 2.1 —
      GREEN.
- [x] 2.3 [RED] Write `tests/unit/recipe-unit.test.ts`: `mergeUnitOptions(builtIn, custom)`
      returns the built-in list plus any custom units not already present, de-duplicated, custom
      units carrying the neutral fallback icon. Run before `domain/unit.ts` exists — MUST fail.
      — *spec: `recipes-catalog` "Unit Input Uses a Persisted Picklist with Free-Text Fallback"*
- [x] 2.4 [GREEN] Create `src/modules/recipes/domain/unit.ts`: `RECIPE_UNITS` (the 14-value
      picklist with icons per proposal decision), `mergeUnitOptions`. [depends: 2.3] Re-run 2.3 —
      GREEN.
- [x] 2.5 [RED] Write `tests/integration/recipes-create-recipe-seam.test.ts` against the local
      Supabase stack: (a) calling `create_recipe`/`update_recipe`/`soft_delete_recipe` with a
      blank reason writes **no** recipe row and no `recipe_changes` row (seam atomicity);
      (b) `soft_delete_recipe` with a valid reason removes the recipe from `listRecipes` while its
      `recipe_changes` history remains readable via `listRecipeChanges`. Run before the
      repositories below exist — MUST fail (module not found / RPC not wired). [depends: 1.5]
      — *spec: `recipes-history` "A direct write bypassing the UI is still rejected", "A stated
      reason allows the write to proceed", "A soft-deleted recipe's data and history survive"*
- [x] 2.6 [GREEN] Create `src/modules/recipes/data/recipe-repository.ts`: `listRecipes(householdId,
      {q, category})` (name substring + category filter, excludes `is_deleted`),
      `getRecipeById(id)` (with ingredients/steps), and RPC wrappers `createRecipe`,
      `updateRecipe`, `softDeleteRecipe`, `hardDeleteRecipe`. [depends: 1.5, 2.2, 2.4] — *spec:
      `recipes-catalog` "Name Search and Category Filter"; `recipes-history` "Soft-Delete
      Excludes a Recipe from Listing and Search While Preserving Its Data"*
- [x] 2.7 [GREEN] Create `src/modules/recipes/data/recipe-history-repository.ts`:
      `listRecipeChanges(recipeId)`. [depends: 1.5] — *spec: `recipes-history` "Collapsed History
      View with Actor, Timestamp, and Reason"*
- [x] 2.8 [GREEN] Create `src/modules/recipes/data/custom-unit-repository.ts`:
      `listCustomUnits(householdId)`. [depends: 1.5] — *spec: `recipes-catalog` "A free-text unit
      is offered on the next recipe", "Free-text units do not leak across households"*
- [x] 2.9 Re-run 2.5's integration test — all assertions PASS (GREEN). [depends: 2.6, 2.7]
- [x] 2.10 Create `src/modules/recipes/api/index.ts`: `server-only` first line, sole public
      barrel re-exporting the three repositories' functions (Gate A boundary). [depends: 2.6,
      2.7, 2.8]
- [x] 2.11 [RED] Extend `tests/integration/recipes-create-recipe-seam.test.ts` (or a new
      cross-household file): a non-member household cannot read another household's recipes via
      `listRecipes`, and cannot read another household's `custom_units` via `listCustomUnits`.
      [depends: 2.6, 2.8] — *spec: `recipes-catalog` "A non-member cannot see the recipe",
      "Free-text units do not leak across households"*
- [x] 2.12 Confirm 2.11 passes against the live RLS policies from Phase 1 (GREEN by
      construction — this is the app-layer confirmation of 1.1's DB-layer isolation proof).
      [depends: 2.11, 1.5]

## Phase 3: `/recetas` Route — List, Create, Edit (PR 3, depends: Phase 2)

- [x] 3.1 Create `src/app/(app)/(recipes)/layout.tsx`: module shell, mirroring
      `(health)/layout.tsx`'s structure (first-time route-group scaffolding for this module).
- [x] 3.2 Create `src/design-system/patterns/IngredientRow.tsx`: quantity + unit select + name
      row, locally-declared props (no module imports, per the design-system boundary rule).
- [x] 3.3 Create `src/design-system/patterns/StepRow.tsx`: numbered instruction row with reorder
      handles, locally-declared props.
- [x] 3.4 [RED] Write `tests/unit/recipe-form-render.test.tsx`: `RecipeForm` blocks submit and
      shows a validation message when the reason field is empty; submit proceeds when a reason is
      present. Run before `RecipeForm.tsx` exists — MUST fail. — *spec: `recipes-history` "A UI
      edit without a reason is blocked"*
- [x] 3.5 [GREEN] Create `src/app/(app)/(recipes)/recetas/RecipeForm.tsx`: client
      create/edit form — title, category select, portions, `video_url` text field, dynamic
      add/remove ingredient rows (via `IngredientRow`, unit picklist merging built-in +
      `mergeUnitOptions` custom units), dynamic add/remove numbered step rows (via `StepRow`),
      mandatory reason field blocking submit when empty. [depends: 3.2, 3.3, 2.4] Re-run 3.4 —
      GREEN. — *spec: `recipes-catalog` "Recipe Core Record", "Category is restricted to the
      fixed enum", "Ingredients are saved in entry order", "Steps render in numeric sequence"*
- [x] 3.6 Create `src/app/(app)/(recipes)/recetas/actions.ts`: `createRecipeAction`,
      `updateRecipeAction`, `softDeleteRecipeAction`, `hardDeleteRecipeAction` Server Actions —
      parse `FormData` into the seam's `jsonb` ingredient/step shape, re-validate the reason is
      non-empty server-side before calling `recipesApi`'s RPC wrappers (defence in depth alongside
      the DB `NOT NULL`), `hardDeleteRecipeAction` additionally checks caller role before
      attempting the call. [depends: 2.10] — *spec: `recipes-history` "A direct write bypassing
      the UI is still rejected"*
- [x] 3.7 [RED] Write `tests/integration/recipes-actions-reason-bypass.test.ts`: calling
      `createRecipeAction`/`updateRecipeAction`/`softDeleteRecipeAction` directly (bypassing the
      rendered form) with an empty/missing reason is rejected and writes no row. Run before 3.6's
      validation is wired — MUST fail. [depends: 2.5] — *spec: `recipes-history` "A direct write
      bypassing the UI is still rejected"*
- [x] 3.8 Re-run 3.7 — GREEN. [depends: 3.6, 3.7]
- [x] 3.9 [RTL, standard mode] Write `tests/unit/recipe-list-render.test.tsx`: name search input
      and category filter chips render; applying both narrows the rendered list.
- [x] 3.10 Create `src/app/(app)/(recipes)/recetas/RecipeList.tsx`: client list, search box,
      category filter chips, composes both constraints simultaneously; verify no layout breakage
      at mobile viewport width. [depends: 2.10] Re-run 3.9 — GREEN. — *spec: `recipes-catalog`
      "Searching by partial name returns matches", "Category filter narrows the list", "Search
      and filter compose on small viewports"*
- [x] 3.11 Create `src/app/(app)/(recipes)/recetas/page.tsx`: server list container, reads
      `searchParams` (`q`, `category`), calls `recipesApi.listRecipes`, passes to `RecipeList`.
      [depends: 3.10, 2.6]
- [x] 3.12 Modify `src/app/(app)/page.tsx`: add one `MODULES` entry —
      `{ label: "Recetas", icon: ChefHat, href: "/recetas" }`. — *covered generically by
      `module-hub`'s "Hardcoded Module Discovery" requirement, per proposal.md*

3.2–3.3 parallel; 3.9 (test) can be written in parallel with 3.4 (test) before either component
exists.

## Phase 4: Recipe Detail — History + Delete Confirmations (PR 4, depends: Phase 3)

- [x] 4.1 [RED] Write `tests/unit/recipe-detail-render.test.tsx`: "Historial de cambios" section
      renders collapsed by default; expanding it displays each entry's actor, timestamp, and
      reason with no field-level diff; a non-owner viewing the recipe's actions sees only
      soft-delete, never hard-delete. Run before `RecipeDetail.tsx` exists — MUST fail. — *spec:
      `recipes-history` "History is collapsed on page load", "Expanding history shows actor,
      timestamp, and reason per entry", "A non-owner does not see a hard-delete option in the UI"*
- [x] 4.2 [GREEN] Create `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx`: client detail —
      collapsed-by-default "Historial de cambios" section (actor/timestamp/reason per row, no
      diff), soft-delete action with a mandatory reason prompt, hard-delete action gated on the
      caller's role (owner-only visibility, distinct strong confirmation step separate from
      soft-delete's confirmation). [depends: 4.1, 2.7] Re-run 4.1 — GREEN.
- [x] 4.3 Create `src/app/(app)/(recipes)/recetas/[id]/page.tsx`: server detail container —
      `getRecipeById` + `listRecipeChanges` composed and passed to `RecipeDetail`. [depends: 4.2,
      2.6, 2.7]
- [x] 4.4 [RED] Write `tests/integration/recipes-hard-delete-flow.test.ts` against the local
      Supabase stack: (a) a non-owner calling `hardDeleteRecipeAction` is rejected (both the
      action's own role check and, if bypassed, the RLS `42501` from 1.1); (b) an owner's
      hard-delete removes the recipe row and its ingredient/step children, while the
      corresponding `recipe_changes` row(s) survive with `recipe_id is null`, the `household_id`
      and `recipe_title` snapshot intact, and the `hard_deleted` reason readable via
      `listRecipeChanges`-equivalent household-scoped query. Run before 3.6's hard-delete action
      is fully wired to the seam — MUST fail. [depends: 1.5] — *spec: `recipes-history` "A
      non-owner is blocked by RLS even bypassing the UI", "An owner can hard-delete behind
      confirmation"*
- [x] 4.5 Re-run 4.4 — all assertions PASS (GREEN) — confirms the full stack (RLS from Phase 1 +
      seam function from Phase 1 + Server Action from Phase 3 + UI gating from 4.2) enforces
      Decision 2 and Decision 3 end to end. [depends: 4.4, 3.6, 4.2]
- [x] 4.6 [RTL, standard mode] Extend `tests/unit/recipe-detail-render.test.tsx`: a soft-delete
      confirmation without a typed reason is blocked client-side; the hard-delete confirmation
      step is visibly distinct (different copy/styling) from the soft-delete confirmation.
      [depends: 4.2]

## Phase 5: Video Reference (PR 5, depends: Phase 3 for `RecipeForm` wiring, Phase 4 for `RecipeDetail` wiring)

- [x] 5.1 [RED] Write `tests/unit/video-embed.test.ts` (threat-matrix row, per design.md's Threat
      Matrix): `resolveEmbed` returns the correct `kind`/`src` for one YouTube URL (all three
      accepted URL shapes: `watch?v=`, `embed/`, `youtu.be/`), one TikTok URL, one Google Drive
      `/file/d/.../preview`-eligible URL; returns `kind: "link"` for an unrecognized-but-valid
      http(s) URL and for a recognized-domain URL with an unmatched path shape; returns
      `kind: "invalid"` for `javascript:` and `data:` URLs (nothing rendered). Run before
      `VideoEmbed.tsx` exists — MUST fail. — *spec: `recipes-video-reference` all four
      requirements*
- [x] 5.2 [GREEN] Create `src/design-system/patterns/VideoEmbed.tsx`: `resolveEmbed` per
      design.md's Interfaces/Contracts match table, iframe render with `sandbox` and the http(s)
      allowlist for recognized platforms, `<a target="_blank" rel="noopener noreferrer">` for the
      link fallback, nothing rendered for `invalid`. Locally-declared props, zero module imports.
      [depends: 5.1] Re-run 5.1 — GREEN.
- [x] 5.3 Wire `VideoEmbed` into `RecipeDetail.tsx` (from 4.2), passing the recipe's `video_url`.
      [depends: 5.2, 4.2] — *spec: `recipes-video-reference` "A YouTube URL renders as an embed",
      "A TikTok URL renders as an embed", "A Google Drive preview URL renders as an embed", "An
      unrecognized URL falls back to a link"*
- [x] 5.4 Confirm `RecipeForm.tsx` (from 3.5) already persists `video_url` as a plain text field
      with no video-specific validation beyond the existing form submission path (a recipe without
      a video URL must save with no error). [depends: 3.5] — *spec: `recipes-video-reference` "A
      recipe is saved without a video URL", "A recipe is saved with one video URL"*
- [x] 5.5 [RTL, standard mode] Write `tests/unit/recipe-detail-video-render.test.tsx`: a recipe
      with a recognized-platform `video_url` renders an iframe (not a link) on the detail page; a
      recipe with an unrecognized `video_url` renders a link (not an iframe); a recipe with no
      `video_url` renders neither. [depends: 5.3]
- [x] 5.6 Confirm no Storage bucket, upload endpoint, or blob-writing code exists anywhere in the
      diff for this slice (manual diff check, not a test) — only the `video_url` text column is
      ever written. [depends: 5.2, 5.4] — *spec: `recipes-video-reference` "Saving a video URL
      creates no storage artifact"*

## Phase 6: Spec Reconciliation

- [x] 6.1 Confirm `specs/recipes-catalog/spec.md`, `specs/recipes-history/spec.md`,
      `specs/recipes-video-reference/spec.md` match the implemented behavior — no wording drift
      between the settled specs and what shipped (unit-picklist contents, per-household custom
      unit scoping, per-save-only history granularity with no field diff, the hard-delete/
      `recipe_changes` survival asymmetry from Decision 2). [depends: all prior phases]
- [x] 6.2 Verify all six proposal.md Success Criteria checkboxes are demonstrably true post-apply:
      create+find-by-name+find-by-category; reason-less edit/soft-delete rejected, reasoned one
      appears in history; soft-deleted recipe absent from list/search while row+history survive;
      non-owner cannot hard-delete (RLS-level, not just UI); TikTok/YouTube/Drive URL embeds,
      other URL links, no video bytes stored; no `visibility` column, no photo upload, no cost
      field, no shopping-list code in the diff. [depends: 6.1]
- [x] 6.3 Confirm `module-architecture`'s Gate A boundary check (verified in design.md against
      `eslint.config.mjs` lines 20–91) holds with zero ESLint config changes — `recipes` module
      boundaries are covered by the existing globs. [depends: all prior phases]
