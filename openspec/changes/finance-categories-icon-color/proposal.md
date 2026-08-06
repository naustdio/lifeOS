# Proposal: Finance Categories — Icon & Color Customization

## Intent

Categories are the only Finance dimension with no visual identity. `finance.categories.icon` and `finance.category_templates.icon` exist but **no template sets a value** and `CategoryChip` takes `icon?: LucideIcon` with no lookup from a stored string — so every category renders as identical text. There is also **no category screen at all** (no `/categorias` route); writes happen only via raw RLS CRUD. A picker is meaningless without the screen, so this change ships both: the missing categories CRUD screen, and icon+color as first-class category attributes with defaults pre-styled.

## Scope

### In Scope
- Migration: add `color text` to `finance.categories` and `finance.category_templates`; both `icon` and `color` constrained to a **bounded token whitelist** (DB CHECK), not free text/hex.
- Backfill: assign icon+color to all 23 templates and to existing seeded `finance.categories` rows via `template_key`. Custom pre-existing rows get a neutral fallback, not NULL-rendered breakage.
- Registry: `iconName -> LucideIcon` map and `colorToken -> semantic class` map in the design system (token file — raw hex is banned outside `src/design-system/tokens/` by `check-tokens`).
- `CategoryChip` resolves stored `icon`/`color` strings; falls back to neutral when absent/unknown.
- New `(app)/categorias/` screen: list two-level tree, create, rename, pick icon+color, deactivate — plus icon/color pickers.
- `category-repository.ts` returns `icon`/`color`; add household-scoped write functions under plain RLS.

### Out of Scope
- Transaction sub-types, account types (Inversiones/Prestado), calendar projection, credit-card features — roadmap changes 2–5.
- Hard delete of categories (archive-only stands), reparenting existing categories, drag-to-reorder `sort_order`.
- Per-user (vs per-household) styling; arbitrary hex/uploaded icons; theming `CategoryChip` call sites beyond passing the resolved values.
- Re-seeding styles into spaces bootstrapped later than the migration beyond the existing `ensure_default_categories` path.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `finance-categories`: categories gain optional icon+color from a bounded palette; seeded defaults MUST ship pre-styled; user-facing CRUD screen becomes a requirement (create/rename/deactivate/restyle).
- `design-system`: `CategoryChip` MUST resolve a stored icon-name and color-token string, with a defined unknown/missing fallback.

## Approach

**Bounded tokens, not free values.** Storing a hex would either violate `check-tokens` or force arbitrary Tailwind values; storing an arbitrary Lucide name would defeat tree-shaking. Both columns store a key from a curated set, validated by DB CHECK *and* by the registry, so an unknown value can never crash a render.

**Optional, never required.** `color`/`icon` stay nullable so no existing row breaks and creation never blocks on a style choice; the UI pre-selects a suggested pair. Defaults are backfilled, not left null.

**Plain RLS, no seam function.** Category writes are single-row with no multi-row invariant — same reasoning `finance-budgets` used. The one-level-nesting and kind-match rules stay enforced by the existing trigger; the screen previews them via `validateCategoryShape`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | `color` columns, CHECK whitelists, template + category backfill, `ensure_default_categories` updated to copy `color` |
| `supabase/tests/050_finance_categories.sql` | Modified | pgTAP: whitelist rejection, backfill coverage, RLS on writes |
| `src/design-system/tokens/` | New | Category color token map |
| `src/design-system/patterns/CategoryChip.tsx` | Modified | Resolve `icon`/`color` strings + fallback |
| `src/modules/finance/data/category-repository.ts` | Modified | Select `icon`/`color`; add create/update/archive |
| `src/modules/finance/ui/` | New | Category list, editor form, icon picker, color picker |
| `src/app/(app)/categorias/` | New | Categories management screen |
| `src/modules/finance/api/` | Unchanged | Explicitly not touched |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Icon picker pulls all of `lucide-react` into the bundle | Med | Curated static registry (~30–40 icons) with explicit named imports; no dynamic import |
| Raw hex sneaks into a color picker → `check-tokens` fails | Med | Colors live only in `src/design-system/tokens/`; components reference semantic classes |
| Chosen colors fail contrast in dark theme | Med | Palette defined as semantic token pairs validated in both themes |
| Whitelist CHECK blocks a later palette addition | Low | Additive migration to extend the CHECK; keys are stable strings |
| CRUD screen scope-creeps into reorder/merge/delete | Med | Explicit non-goals; archive-only, no reparenting |
| Deactivating a category referenced by a budget/recurring row | Low | Archive semantics already exist; screen surfaces existing references before archiving |
| 400-line review budget exceeded (migration + screen + design system) | High | Flag to `sdd-tasks`: expect stacked slices (DB+backfill → design-system → repository+screen) |

## Rollback Plan

Additive and reversible. Down path: `alter table finance.categories drop column color; alter table finance.category_templates drop column color;` plus dropping the CHECK on `icon`. Template `icon` backfill values are cosmetic and can be nulled without touching any transaction. UI rollback is deleting `src/app/(app)/categorias/`, reverting `CategoryChip` to the current icon-prop-only shape, and reverting the repository selects. No transaction, budget, or account row is mutated; `finance/api` is untouched, so no seam consumer can break.

## Dependencies

- `finance.categories`, `finance.category_templates`, `finance.ensure_default_categories`, and the one-level-nesting trigger from archived `lifeos-foundation` — all present.
- Existing `design-system` chip primitives (`src/design-system/ui/chip.tsx`) and the Radix `select` convention for dropdowns.

## Assumptions Needing User Confirmation

1. Icon+color are **optional** (nullable) with a neutral fallback — not required on create.
2. Pre-existing custom categories are **not** force-styled by the migration; only template-derived rows are backfilled.
3. Styling is **per household**, shared by all members — not per user.
4. Palette is a **curated bounded set**, not a free color wheel or hex input.
5. This change **also delivers** the missing categories CRUD screen; it is not a UI-only chip change.

## Success Criteria

- [ ] Every seeded default category renders a distinct, kind-appropriate icon and color immediately after a fresh space bootstrap.
- [ ] A user can create a category, choose icon+color, and see it applied everywhere `CategoryChip` renders.
- [ ] An unknown or NULL `icon`/`color` renders the neutral fallback, never a crash or blank chip.
- [ ] A value outside the whitelist is rejected by the database CHECK, not only by the UI.
- [ ] The one-level-nesting and child-shares-kind rules still reject invalid saves from the new screen.
- [ ] Another space's categories are never readable or writable through the new screen (RLS honored).
- [ ] Deactivated categories stay hidden from transaction pickers but still render styled on historical transactions.
- [ ] Colors pass contrast in both light and dark themes; screen is usable at 375px.
- [ ] `pnpm verify` passes (including `check-tokens`); `finance/api` shows zero diff.
