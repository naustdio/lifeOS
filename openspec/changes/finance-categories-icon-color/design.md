# Design: Finance Categories — Icon & Color Customization

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in `archive/finance-budgets/design.md`,
> the orchestrator's task contract for this change explicitly requires DDL-level schema, a token/registry
> table, a screen shape, and a §-style testing table. The explicit contract wins.
>
> **Inputs**: `proposal.md` and `specs/finance-categories/spec.md` (4 requirements) +
> `specs/design-system/spec.md` (2 requirements). Product decisions confirmed by the owner
> (optional styling, migration backfills *every* row, household-scoped, CRUD screen in scope) are
> fixed constraints and are not re-litigated here. Conventions inherited verbatim from
> `archive/lifeos-foundation/design.md` §3/§4/§7/§9 and the shipped migrations.

## Technical Approach

Two bounded key sets — **icon keys** and **color keys** — are the entire contract. A key is a stable
short string stored in `finance.categories` / `finance.category_templates`, validated twice: by a DB
`CHECK` against a literal list (the same shape as `accounts.type` and `transactions.type` in
`20260804090005_finance_schema.sql`) and by a static registry in `src/design-system/tokens/`. The
database is the authority on *what may be stored*; the registry is the authority on *how it renders*,
and it always resolves — an unknown or `NULL` key degrades to a neutral fallback rather than throwing.

This satisfies the two hard technical constraints at once: no hex or Tailwind arbitrary value ever
leaves `src/design-system/tokens/` (so `scripts/check-tokens.mjs` passes), and no Lucide icon is ever
resolved from a runtime string against the whole package (so tree-shaking survives — the registry has
explicit named imports only).

Writes go through **plain RLS with no `SECURITY DEFINER` seam** — not a new decision, the existing one:
`finance.categories` already has `categories_select` / `categories_insert` / `categories_update`
policies and `grant insert, update on finance.categories to authenticated` in
`20260804090006_finance_security.sql`, and deliberately **no DELETE** (archive via `archived_at`).
This change adds **zero** RLS objects. `finance/api/index.ts` gains re-exports only; no `.rpc()` seam.

## 1. Migration — `supabase/migrations/20260804090017_finance_category_style.sql`

One migration file. There is no companion `*_security.sql` because no policy, grant, or table is
introduced — a first for this project, and deliberate.

```sql
-- 1. columns (nullable: styling is OPTIONAL on create, per product decision)
alter table finance.category_templates add column color text;
alter table finance.categories         add column color text;

-- 2. bounded whitelists, mirroring the accounts.type / transactions.type CHECK style
alter table finance.categories add constraint categories_color_whitelist
  check (color is null or color in
    ('neutral','red','orange','amber','green','teal','blue','violet','pink'));
alter table finance.categories add constraint categories_icon_whitelist
  check (icon is null or icon in
    ('banknote','briefcase','trending-up','gift','coins',
     'utensils','car','house','heart-pulse','clapperboard','graduation-cap','shirt',
     'sparkles','landmark','tag','shopping-cart','chef-hat','fuel','bus','wrench',
     'key','zap','wifi','plane','dumbbell','baby','paw-print','smartphone',
     'book','gamepad-2','coffee','credit-card','circle-dashed'));
-- identical pair of constraints on finance.category_templates
```

`icon` already exists on both tables and is universally `NULL` — the CHECK is retrofitted, not added
to live data, so it cannot fail on deploy.

**Backfill, three passes, in this order:**

| # | Target | Rule |
|---|---|---|
| 1 | `finance.category_templates` (23 rows) | Curated `update … set icon, color` per `key` — §2 table. Intentional, meaning-matched. |
| 2 | `finance.categories where template_key is not null` | `update … from finance.category_templates t where c.template_key = t.key` — inherits the curated pair. Runs *after* pass 1. |
| 3 | `finance.categories where template_key is null and (icon is null or color is null)` | Deterministic fallback (see below). |

Pass 3 (pre-existing custom categories, the owner-confirmed requirement that **no row stays unstyled**):

```sql
update finance.categories c set
  icon  = coalesce(c.icon, case when c.kind = 'income' then 'trending-up' else 'tag' end),
  color = coalesce(c.color, (array['neutral','red','orange','amber','green','teal','blue','violet','pink'])
                            [ (('x' || substr(md5(c.id::text), 1, 8))::bit(32)::int & 2147483647) % 9 + 1 ])
where c.template_key is null;
```

`md5(id)` — not `hashtext()` — because `hashtext` is an undocumented internal whose value is not
guaranteed stable across major Postgres versions; `md5` makes the assignment reproducible, so a
re-run or a replayed migration lands on the same color. `& 2147483647` clears the sign bit
(`::bit(32)::int` can be negative and Postgres arrays are 1-based, so a negative modulus would error).
Icon is generic-by-kind rather than hashed: a *wrong* icon reads as a bug, a *neutral* one does not,
while an arbitrary color reads as decoration.

**`finance.ensure_default_categories()` — `create or replace`, both passes.** Add `color` to the
column list and `t.color` to the select in *both* the top-level and the child insert. Without this,
every household onboarded after the migration gets curated icons but `NULL` colors, silently
diverging from the templates. The rest of the function (definer, `set search_path = ''`,
`perform core.assert_member`, `on conflict … do nothing`, the revoke) is unchanged.

## 2. Curated Template Styling (23 rows)

| Template key | icon | color | | Template key | icon | color |
|---|---|---|---|---|---|---|
| `income.salary` | `banknote` | green | | `expense.debt` | `landmark` | red |
| `income.freelance` | `briefcase` | teal | | `expense.other` | `tag` | neutral |
| `income.investments` | `trending-up` | green | | `expense.food.groceries` | `shopping-cart` | orange |
| `income.gifts` | `gift` | pink | | `expense.food.restaurants` | `chef-hat` | orange |
| `income.other` | `coins` | neutral | | `expense.transport.fuel` | `fuel` | blue |
| `expense.food` | `utensils` | orange | | `expense.transport.public` | `bus` | blue |
| `expense.transport` | `car` | blue | | `expense.transport.maint` | `wrench` | blue |
| `expense.home` | `house` | amber | | `expense.home.rent` | `key` | amber |
| `expense.health` | `heart-pulse` | red | | `expense.home.utilities` | `zap` | amber |
| `expense.entertainment` | `clapperboard` | violet | | `expense.home.internet` | `wifi` | amber |
| `expense.education` | `graduation-cap` | teal | | `expense.clothing` | `shirt` | pink |
| `expense.personal` | `sparkles` | violet | | | | |

Children share their parent's hue so the two-level tree reads as families; leftover registry icons
(`plane`, `dumbbell`, `baby`, …) exist for user-created categories only.

## 3. Design-System Layer

### `tokens/primitives.css` (Modify)
Nine OKLCH hue pairs, one light + one dark value each, e.g. `--cat-blue-500 / --cat-blue-400`.
Same file, same style as the existing `--green-*` / `--red-*` block. Raw color values live **only**
here, exactly as `check-tokens.mjs` requires.

### `tokens/semantic.css` (Modify)
`:root` and `.dark` each map the nine keys to a foreground and a surface token:

```css
--category-blue: var(--cat-blue-600);        /* :root */
--category-blue-surface: var(--cat-blue-100);
/* .dark overrides the SAME names with the dark-theme primitives */
```

Dark theme uses lighter foregrounds and a low-chroma surface, mirroring how `--income`/`--expense`
already swap `--green-600` → `--green-500`. This is what makes the contrast requirement structural
rather than a review-time hope.

### `src/app/globals.css` (Modify)
Add 18 `@theme inline` lines (`--color-category-blue: var(--category-blue);` + `-surface`) so
`bg-category-blue-surface text-category-blue` are real utilities.

### `src/design-system/tokens/category-style.ts` (Create) — the registry

Placed in `tokens/` because the design-system spec requires it there, and because a future palette
entry must be able to sit next to its token without tripping `check-tokens.mjs`.

```ts
import { Banknote, Bus, Car, CircleDashed, /* …explicit named imports only… */ } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const CATEGORY_ICONS = { banknote: Banknote, bus: Bus, /* … */ } as const;
export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

/** Full literal class strings — Tailwind cannot see interpolated names. */
export const CATEGORY_COLORS = {
  neutral: { text: "text-muted-foreground", surface: "bg-muted" },
  blue:    { text: "text-category-blue",    surface: "bg-category-blue-surface" },
  /* … */
} as const;
export type CategoryColorKey = keyof typeof CATEGORY_COLORS;

export const FALLBACK_ICON_KEY = "circle-dashed" satisfies CategoryIconKey;
export const FALLBACK_COLOR_KEY = "neutral" satisfies CategoryColorKey;

/** Total functions: any string (or null/undefined) in, a renderable value out. */
export function resolveCategoryIcon(key: string | null | undefined): LucideIcon;
export function resolveCategoryColor(key: string | null | undefined): { text: string; surface: string };
```

The class strings are written out in full. `` `bg-category-${key}` `` would compile and then render
unstyled in production, because Tailwind v4 extracts literal substrings and never sees the joined name
— the single most likely silent failure in this change.

### `patterns/CategoryChip.tsx` (Modify)

`icon?: LucideIcon` becomes `iconKey?: string | null` + `colorKey?: string | null`; the component
calls the two resolvers and applies `surface` to the icon bubble (replacing the hardcoded
`bg-background`) and `text` to the glyph. The icon bubble is now **always** rendered — a missing key
yields the fallback glyph, not the current `null` branch, which is what makes "never a blank chip"
true by construction. `CategoryChip` has no call sites in `src/` today, so this is a non-breaking
signature change; wiring it into transaction lists stays out of scope per the proposal.

## 4. Data Layer — `src/modules/finance/data/category-repository.ts` (Modify)

Currently read-only (`listActiveCategories`). Add `icon, color` to the existing select and:

```ts
export type CategoryListItem = { /* …existing… */ icon: string | null; color: string | null };

/** Full two-level tree for the management screen, including archived rows (flagged, not hidden). */
export async function listCategoryTree(
  supabase: SupabaseClient, householdId: string): Promise<CategoryTreeItem[]>;

export async function createCategory(supabase: SupabaseClient, householdId: string, input: {
  name: string; kind: CategoryKind; parentId: string | null;
  icon: string | null; color: string | null;
}): Promise<{ error: string | null }>;

export async function updateCategory(supabase: SupabaseClient, householdId: string, id: string,
  patch: { name?: string; icon?: string | null; color?: string | null },
): Promise<{ error: string | null }>;

/** Archive, never delete — there is no DELETE policy or grant on finance.categories. */
export async function archiveCategory(
  supabase: SupabaseClient, householdId: string, id: string): Promise<{ error: string | null }>;
```

Same shape as `budget-repository.ts`: take a `SupabaseClient`, client-direct
`supabase.schema("finance").from("categories")` under RLS, no `server-only`, degrade to
`[]`/`{ error }` instead of throwing. Every write carries `.eq("household_id", householdId)` as
defence-in-depth alongside RLS. `updateCategory` never accepts `kind`, `parent_id`, or
`household_id` — reparenting and kind changes are explicit non-goals, and omitting them from the
patch type means the trigger can never be reached with a re-shaping update from this screen.

Re-export through `data/index.ts` and `api/index.ts` (the ESLint boundary forbids `app → data`), under
the same barrel comment that already documents the `finance.categories` plain-RLS exception.

## 5. Screen — `src/app/(app)/categorias/`

```
page.tsx (server)
  getCurrentHouseholdId → listCategoryTree(supabase, spaceId)
        │
        └──▶ CategoryList (client)          ── grouped: Ingresos / Gastos, parents with nested children
                 ├─ row: <CategoryChip iconKey colorKey name /> + rename / archive
                 └─ "Nueva categoría" ─▶ CategoryEditor (client, Sheet)
                          ├─ name input · kind (Radix Select) · parent (Radix Select, top-level only)
                          ├─ IconPicker    — grid of registry icons, 6/row, radio semantics
                          ├─ ColorPicker   — row of 9 swatches, radio semantics
                          └─ validateCategoryShape(candidate, parent)  ← client-side preview of the trigger
                                    │
                                    └─▶ actions.ts ─▶ createCategory / updateCategory / archiveCategory
```

`actions.ts` follows `presupuestos/actions.ts` verbatim: `"use server"`, `createClient()`,
`getCurrentHouseholdId`, guard, call the repository through `@/modules/finance/api`,
`revalidatePath("/categorias")`, return `{ error }`. Both pickers are presentational (`value` +
`onChange`), keyboard-navigable, and read their options from `CATEGORY_ICONS` / `CATEGORY_COLORS` —
there is no free-text or hex input anywhere in the UI, which is how the "picker only offers registry
values" scenario holds. Selection is optional; leaving both unset submits `null` and the row renders
the fallback. Single column, 375px-usable. The Radix `select.tsx` convention applies to the kind and
parent dropdowns (never a native `<select>`).

## 6. Key Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | Bounded key sets, CHECK + registry | free text; arbitrary Lucide name; hex column | A hex column forces either a `check-tokens.mjs` violation or a Tailwind arbitrary value; an arbitrary Lucide name defeats tree-shaking. Keys are the only shape satisfying both gates |
| 2 | Columns stay **nullable**, backfill makes them non-null in practice | `not null default 'neutral'` | Product decision: styling is optional on create. A `NOT NULL` would make the picker mandatory and force a default into every future insert path; nullable + a total resolver gives the same visual guarantee with no write-side coupling |
| 3 | Full literal Tailwind class strings in the registry | `` `bg-category-${key}` `` | Tailwind v4 extracts literal substrings; an interpolated name compiles clean and renders unstyled in production |
| 4 | `md5(id)`-derived color for pre-existing custom rows, generic icon by kind | one flat neutral pair for all; `hashtext()` | `hashtext` is not version-stable, so a replay could recolor rows. A wrong *icon* reads as a bug while a varied *color* reads as decoration — hence hashing only the color |
| 5 | No new migration for RLS/grants | a `*_security.sql` companion, or a `finance.set_category_style()` definer | `categories_insert`/`categories_update` and the `insert, update` grant already exist; a style write is one row with no multi-row invariant — the same reasoning `finance-budgets` used. A definer would add escalation surface for nothing |
| 6 | `ensure_default_categories()` extended to copy `color` | leaving it icon-only | It already copies `icon`; without `color` every household onboarded after this migration silently diverges from the templates. This is the one non-obvious coupling in the change |
| 7 | `updateCategory` patch excludes `kind` / `parent_id` | a general-purpose update | Reparenting and kind changes are explicit non-goals; excluding them from the type means the screen structurally cannot reach the shape trigger with a re-shaping update |
| 8 | Icon bubble always rendered in `CategoryChip` | keep the `Icon ? … : null` branch | "Never a blank chip" becomes structural instead of depending on callers passing a key |

## 7. File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260804090017_finance_category_style.sql` | Create | §1: columns, 4 CHECKs, 3 backfill passes, `ensure_default_categories` replace |
| `supabase/tests/050_finance_categories.sql` | Modify | pgTAP per §8 |
| `src/design-system/tokens/primitives.css` | Modify | 9 category hue pairs (light + dark values) |
| `src/design-system/tokens/semantic.css` | Modify | `--category-*` / `--category-*-surface` in `:root` and `.dark` |
| `src/design-system/tokens/category-style.ts` | Create | Icon + color registries, fallbacks, two total resolvers |
| `src/app/globals.css` | Modify | 18 `@theme inline` mappings |
| `src/design-system/patterns/CategoryChip.tsx` | Modify | `iconKey`/`colorKey` props, resolvers, always-on icon bubble |
| `src/modules/finance/data/category-repository.ts` | Modify | `icon`/`color` in selects; `listCategoryTree`, `createCategory`, `updateCategory`, `archiveCategory` |
| `src/modules/finance/data/index.ts` | Modify | Re-export the new functions |
| `src/modules/finance/api/index.ts` | Modify | Re-export (ESLint boundary) — the only diff, no new seam |
| `src/app/(app)/categorias/page.tsx` | Create | Server container: tree fetch |
| `src/app/(app)/categorias/CategoryList.tsx` | Create | Client: two-level tree grouped by kind |
| `src/app/(app)/categorias/CategoryEditor.tsx` | Create | Client: create/edit sheet + shape preview |
| `src/app/(app)/categorias/IconPicker.tsx` | Create | Registry-driven icon grid |
| `src/app/(app)/categorias/ColorPicker.tsx` | Create | Registry-driven swatch row |
| `src/app/(app)/categorias/actions.ts` | Create | 3 server actions over the repository |
| `tests/unit/category-style-registry.test.ts` | Create | Resolver totality + DB/registry parity |
| `tests/unit/category-chip-render.test.tsx` | Create | RTL: known / null / unknown key |
| `tests/unit/category-editor-render.test.tsx` | Create | RTL: picker options, optional selection, shape rejection |

## 8. Testing Strategy

| Layer | What is tested | Tooling |
|---|---|---|
| Unit — registry | `resolveCategoryIcon`/`resolveCategoryColor` are **total**: known key → its value; `null`/`undefined`/`""`/unknown → the fallback, never `undefined`. **Parity test**: every key in `CATEGORY_ICONS`/`CATEGORY_COLORS` appears in the migration's CHECK list and vice-versa (list asserted against a fixture copied from the migration) — this is what stops the registry and the database drifting | Vitest |
| Unit — domain | `validateCategoryShape` unchanged; re-assert the editor's rejection paths (depth-2 parent, kind mismatch) | Vitest |
| DB — whitelist | `icon = 'not-a-real-icon'` rejected by CHECK; `color = '#FF0000'` rejected; both on `categories` **and** `category_templates`; a valid key accepted; `NULL` still accepted (optionality) | pgTAP |
| DB — backfill coverage | After migration: zero rows in `category_templates` with `NULL` icon or color; zero in `categories`; a template-derived row's pair **equals** its template's pair; a `template_key is null` row seeded pre-migration has non-null both; re-running pass 3 is idempotent and yields the same color for the same `id` | pgTAP |
| DB — onboarding parity | Call `finance.ensure_default_categories()` for a fresh household → every created row's `icon`/`color` equals its template's. **Fails if the `color` copy is dropped from either pass** — the named regression for Decision 6 | pgTAP |
| DB — tenancy | Existing `categories_*` policies still hold for the new column: a member can update `color` on their own row; a non-member's update affects zero rows; `anon` zero; no DELETE path exists | pgTAP |
| DB — shape trigger | Creating a depth-2 child or a kind-mismatched child from a style-carrying insert still raises `22023` | pgTAP |
| RTL | `CategoryChip`: known pair renders the icon + semantic classes; `null`/unknown renders the fallback with no crash and no blank. `CategoryEditor`: pickers render exactly the registry options and no text/hex input; saving with nothing selected submits null; kind/parent use the Radix select | Vitest + Testing Library |
| Static gates | `pnpm verify` — ESLint boundaries (`app → module-api/design-system/shared`; `domain` pure), `tsc --noEmit`, **`check-tokens.mjs`** (the load-bearing gate for §3), `next build` | `pnpm verify` |
| E2E | Not required — every behavior is covered more cheaply above. Optional: 375px light/dark render of `/categorias` | Playwright (optional) |

## Threat Matrix

**N/A** — no routing, shell command, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary is introduced. The real adversarial surface is application-level and is
covered explicitly: direct-PostgREST writes bypassing the picker (§1 CHECKs, tested), cross-household
restyling (existing RLS, tested), and hostile stored values reaching the renderer (§3 total resolvers,
tested). Icon components are statically imported, so no user-controlled string ever reaches a dynamic
`import()` or a component lookup that could resolve to something unexpected.

## Migration / Rollout

Additive and reversible. Deploy **migration first, then app** — the app tolerates either order
(a pre-migration app ignores `color`; a post-migration app with no `color` column would break its
select, so the reverse order is a real hazard, unlike in `finance-budgets`).

Down path:

```sql
alter table finance.categories         drop constraint categories_icon_whitelist,
                                       drop constraint categories_color_whitelist,
                                       drop column color;
alter table finance.category_templates drop constraint /* … */, drop column color;
update finance.categories set icon = null;  -- cosmetic only; no transaction is touched
-- plus: create or replace finance.ensure_default_categories() at its previous body
```

No transaction, budget, account, or recurring row is mutated; no tenant key changes; no `NOT NULL` is
retrofitted. UI rollback is deleting `src/app/(app)/categorias/`, reverting `CategoryChip` to the
`icon?: LucideIcon` signature (it has no call sites, so nothing else breaks), and reverting the
repository selects.

### PR Slicing — 1000-line review budget

Estimated ~1,050 authored lines total, so a single PR sits right at the limit with no headroom.
Two stacked slices, mirroring the `finance-budgets` convention (PR #1 → feature branch, PR #2 → PR #1):

| Slice | Contents | Est. lines | Standalone value |
|---|---|---|---|
| **A — data + tokens** | Migration, pgTAP, `primitives.css`, `semantic.css`, `globals.css`, `category-style.ts`, `CategoryChip`, registry + chip tests | ~520 | Every existing category is styled in the DB and any chip renders it; verifiable and shippable with no UI route |
| **B — CRUD screen** | Repository write-side, `data`/`api` re-exports, `categorias/` page + list + editor + pickers + actions, RTL tests | ~530 | The management screen, on top of a palette that already exists |

If slice A overruns during implementation, split the migration + pgTAP (A1) from the design-system
tokens + chip (A2); they have no compile-time dependency on each other.

## Open Questions

None blocking. Two implementation-time verifications (not assumptions to design around):

- [ ] Confirm the nine chosen OKLCH hue pairs clear WCAG AA against `--surface` in **both** themes —
      measure at implementation, adjust lightness in `primitives.css` only.
- [ ] Confirm Tailwind v4 emits the `bg-category-*-surface` utilities from the literal strings in
      `tokens/category-style.ts` (the file is inside `src/`, so it is in the default content scan —
      verify with a real `next build`, not by inspection).
