# Tasks: Finance Categories — Icon & Color Customization

> Task IDs use the `C-` prefix (`C-001`..`C-019`). Each task cites the exact spec requirement(s) it
> satisfies via `finance-categories-icon-color/Requirement Name`. Design section references use
> `design.md §N`. **Strict TDD is `false`** for this project (per `sdd-init/lifeos`) — critical-logic
> focus, not blanket TDD, matching the `finance-budgets` precedent where tests accompany the logic
> they cover rather than gating every task. RED-first ordering is applied only to the two genuinely
> critical-logic surfaces named in the design: the total resolver functions (`resolveCategoryIcon`/
> `resolveCategoryColor`) and `CategoryChip`'s fallback-render guarantee. Migration/pgTAP and
> repository/screen tasks follow the same non-TDD-gate convention `finance-budgets` used for
> `B-001`/`B-004`/`B-009`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,050 total (design.md §"PR Slicing") |
| 1000-line budget risk | Low per slice, High if shipped as one PR |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (data + tokens) → PR 2 (CRUD screen) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — user already confirmed the 2-slice stacked-to-main split.
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
1000-line budget risk: Low (each slice individually) / High (single PR)

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration backfills every category to a styled row; registries render a chip for any stored key | PR 1 | `pnpm vitest run tests/unit/category-style-registry.test.ts tests/unit/category-chip-render.test.tsx` + `supabase test db` | `pnpm verify` (incl. `check-tokens.mjs`, `next build`) | Revert migration (down SQL in design.md), revert `CategoryChip` to `icon?: LucideIcon` (no call sites, non-breaking), revert 3 CSS files, delete `category-style.ts` |
| 2 | `/categorias` screen lets a household create/rename/deactivate/restyle categories via registry-only pickers | PR 2 | `pnpm vitest run tests/unit/category-editor-render.test.tsx` | Manual: open `/categorias` at 375px light+dark against local Supabase | Delete `src/app/(app)/categorias/`, revert `category-repository.ts`/`data/index.ts`/`api/index.ts` re-exports — PR 1 is unaffected |

---

## PR 1 — Data + Tokens (~520 lines)

### (a) Database

- [x] C-001 — Migration: `supabase/migrations/20260804090017_finance_category_style.sql`
  - `alter table` adds `color` to `finance.categories` and `finance.category_templates` (nullable).
  - `categories_icon_whitelist` / `categories_color_whitelist` CHECK constraints (per design.md §1 literal lists), identical pair on `category_templates`.
  - Three backfill passes in order: (1) curated `category_templates` update per §2's 23-row table, (2) `categories where template_key is not null` inherits from templates, (3) `categories where template_key is null` gets the `md5(id)`-derived color + kind-based icon fallback.
  - `create or replace finance.ensure_default_categories()` — add `color` to both the top-level and child insert column lists/selects.
  - Satisfies: `Bounded Icon and Color Registry`, `Migration Backfills Every Category to a Non-Null Style` (all 3 scenarios).
  - Depends on: none.
  - Parallel: sequential (must land before C-002).

- [x] C-002 — pgTAP: `supabase/tests/050_finance_categories.sql` (modify)
  - Whitelist rejection: invalid `icon`/`color` rejected on both `categories` and `category_templates`; valid key accepted; `NULL` still accepted.
  - Backfill coverage: zero `NULL` icon/color rows post-migration on both tables; a template-derived row's pair equals its template's; re-running pass 3 is idempotent for the same `id`.
  - Onboarding parity: `finance.ensure_default_categories()` for a fresh household produces rows whose icon/color equal their template's (regression for dropping the `color` copy).
  - Tenancy: existing `categories_*` policies still hold for `color`; non-member/`anon` writes affect zero rows.
  - Shape trigger: a style-carrying insert with a depth-2 or kind-mismatched parent still raises `22023`.
  - Satisfies: `Bounded Icon and Color Registry` (both DB scenarios), `Household-Scoped Icon and Color` (non-member scenario), `Migration Backfills Every Category to a Non-Null Style` (all 3 scenarios).
  - Depends on: C-001.
  - Parallel: sequential.

### (b) Design-System Tokens

- [x] C-003 — `src/design-system/tokens/primitives.css` (modify): 9 OKLCH hue pairs (`--cat-{name}-500`/`-400`, light+dark), same block style as existing `--green-*`.
  - Depends on: none. Parallel: yes, independent of (a).

- [x] C-004 — `src/design-system/tokens/semantic.css` (modify): `--category-{name}` / `--category-{name}-surface` in `:root` and `.dark`, mirroring the `--income`/`--green` swap pattern.
  - Depends on: C-003. Parallel: sequential after C-003.

- [x] C-005 — `src/app/globals.css` (modify): 18 `@theme inline` lines binding `--color-category-*` / `-surface` so `bg-category-*-surface text-category-*` become real Tailwind utilities.
  - Depends on: C-004. Parallel: sequential after C-004.

- [x] C-006 [RED] — `tests/unit/category-style-registry.test.ts` (create): failing test asserting `resolveCategoryIcon`/`resolveCategoryColor` are total (known key → value; `null`/`undefined`/`""`/unknown → fallback, never `undefined`) and a parity assertion that every `CATEGORY_ICONS`/`CATEGORY_COLORS` key appears in a fixture copied from the migration's CHECK list and vice versa. Fails: `category-style.ts` does not exist yet.
  - Satisfies (drives): `Category Icon and Color Token Registries` (both scenarios).
  - Depends on: C-005 (references the CSS class names it will assert against).
  - Parallel: sequential.

- [x] C-007 [GREEN] — `src/design-system/tokens/category-style.ts` (create): `CATEGORY_ICONS`, `CATEGORY_COLORS` (full literal Tailwind class strings, no interpolation), `FALLBACK_ICON_KEY`/`FALLBACK_COLOR_KEY`, `resolveCategoryIcon`/`resolveCategoryColor` — implemented to satisfy C-006.
  - Depends on: C-006.
  - Parallel: sequential.

- [x] C-008 [RED] — `tests/unit/category-chip-render.test.tsx` (create): failing RTL test — known icon+color pair renders the icon and semantic classes; `null`/unknown key renders the fallback glyph with no crash and no blank chip. Fails: `CategoryChip` still takes `icon?: LucideIcon`.
  - Satisfies (drives): `CategoryChip Resolves Stored Style With Fallback` (both scenarios), `User-Created Categories` (no-icon/color renders neutral default scenario).
  - Depends on: C-007.
  - Parallel: sequential.

- [x] C-009 [GREEN] — `src/design-system/patterns/CategoryChip.tsx` (modify): replace `icon?: LucideIcon` with `iconKey?: string | null` + `colorKey?: string | null`, call the two resolvers, apply `surface`/`text` classes, icon bubble always renders (no `null` branch) — implemented to satisfy C-008. Non-breaking (no existing call sites in `src/`).
  - Depends on: C-008.
  - Parallel: sequential (closes out PR 1).

---

## PR 2 — CRUD Screen (~530 lines, stacked on PR 1)

### (c) Data Layer

- [ ] C-010 — `src/modules/finance/data/category-repository.ts` (modify): add `icon`/`color` to `CategoryListItem` and the existing select; add `listCategoryTree`, `createCategory`, `updateCategory` (patch excludes `kind`/`parent_id`), `archiveCategory` (sets `archived_at`, no DELETE grant/policy exists). Client-direct `supabase.schema("finance")`, no `server-only`, degrade to `[]`/`{ error }`, `.eq("household_id", householdId)` on every write.
  - Satisfies: `User-Created Categories` (explicit icon+color scenario), `Household-Scoped Icon and Color` (member-visible scenario), `Categories Management Screen` (restyle scenario, kind/nesting-rule enforcement scenario).
  - Depends on: C-009 (consumes `CategoryChip`'s new prop shape indirectly via the tree item type contract).
  - Parallel: yes, independent of (d) until C-013+.

- [ ] C-011 — `src/modules/finance/data/index.ts` (modify): re-export `listCategoryTree`, `createCategory`, `updateCategory`, `archiveCategory`.
  - Depends on: C-010. Parallel: sequential.

- [ ] C-012 — `src/modules/finance/api/index.ts` (modify): re-export the same four functions (ESLint `app → data` boundary), same barrel-comment convention documenting the plain-RLS exception.
  - Depends on: C-011. Parallel: sequential.

### (d) Categorias Screen

- [ ] C-013 [RED] — `tests/unit/category-editor-render.test.tsx` (create): failing RTL test — icon/color pickers render exactly the registry options with no free-text/hex input; saving with nothing selected submits `null`/`null`; depth-2 parent or kind-mismatched child is rejected consistent with `validateCategoryShape`. Fails: `CategoryEditor`, `IconPicker`, `ColorPicker` do not exist yet.
  - Satisfies (drives): `Bounded Icon and Color Registry` (picker-only-registry scenario), `Categories Management Screen` (nesting/kind-rule scenario).
  - Depends on: C-007 (registry), C-012 (repository re-exports the type shape it renders against).
  - Parallel: sequential.

- [ ] C-014 [GREEN] — `src/app/(app)/categorias/IconPicker.tsx` (create): registry-driven icon grid (6/row), `value`/`onChange`, radio semantics, keyboard-navigable, reads options from `CATEGORY_ICONS` only.
  - Depends on: C-013. Parallel: yes, parallel with C-015.

- [ ] C-015 [GREEN] — `src/app/(app)/categorias/ColorPicker.tsx` (create): registry-driven swatch row (9 keys), `value`/`onChange`, radio semantics, reads options from `CATEGORY_COLORS` only.
  - Depends on: C-013. Parallel: yes, parallel with C-014.

- [ ] C-016 [GREEN] — `src/app/(app)/categorias/CategoryEditor.tsx` (create): client Sheet — name input, kind (Radix `select.tsx`, never native `<select>`), parent (Radix Select, top-level only), embeds `IconPicker`/`ColorPicker`, `validateCategoryShape` client-side preview, calls `actions.ts` — implemented to satisfy C-013.
  - Depends on: C-014, C-015.
  - Parallel: sequential.

- [ ] C-017 — `src/app/(app)/categorias/CategoryList.tsx` (create): client component, two-level tree grouped by kind (Ingresos/Gastos), row renders `<CategoryChip iconKey colorKey name />` + rename/archive actions, "Nueva categoría" opens `CategoryEditor`.
  - Satisfies: `Categories Management Screen` (tree-listing scenario).
  - Depends on: C-009 (CategoryChip prop shape), C-016 (opens the editor).
  - Parallel: yes, parallel with C-018.

- [ ] C-018 — `src/app/(app)/categorias/actions.ts` (create): `"use server"` — `createCategoryAction`, `updateCategoryAction`, `archiveCategoryAction` following `presupuestos/actions.ts`'s shape (`createClient()`, `getCurrentHouseholdId`, guard, call via `@/modules/finance/api`, `revalidatePath("/categorias")`, return `{ error }`).
  - Depends on: C-012.
  - Parallel: yes, parallel with C-017.

- [ ] C-019 — `src/app/(app)/categorias/page.tsx` (create): server container — `getCurrentHouseholdId` → `listCategoryTree(supabase, householdId)` → renders `<CategoryList>`.
  - Satisfies: `Categories Management Screen` (tree-listing scenario, end-to-end wiring).
  - Depends on: C-010, C-017.
  - Parallel: sequential (closes out PR 2).

---

## Dependency Summary (critical path)

```
C-001 (migration) → C-002 (pgTAP)                                       [PR 1]
C-003 (primitives.css) → C-004 (semantic.css) → C-005 (globals.css)
C-005 → C-006 [RED] → C-007 [GREEN] (category-style.ts)
C-007 → C-008 [RED] → C-009 [GREEN] (CategoryChip)                      [PR 1 closes]
C-009 → C-010 (repository) → C-011 → C-012 (re-exports)                 [PR 2]
C-007, C-012 → C-013 [RED] → C-014, C-015 (pickers, parallel) → C-016 [GREEN] (CategoryEditor)
C-009, C-016 → C-017 (CategoryList)             [parallel with C-018 (actions.ts), C-012 → C-018]
C-010, C-017 → C-019 (page.tsx, last)                                   [PR 2 closes]
```

C-002 (pgTAP) is not a TDD gate for the app-code tasks below it — it accompanies C-001, consistent
with the `finance-budgets` precedent. C-006, C-008, C-013 ARE explicit RED-first gates: they cover
the design's named critical-logic surfaces (total resolvers, chip fallback guarantee, registry-only
picker + shape rejection) and must fail before their GREEN implementation task lands.
