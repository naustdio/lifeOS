# Design: Neutral module hub at `/` + per-module navigation (app-module-hub)

## Technical Approach

Next.js 15 nested layouts. `AppLayout` (`src/app/(app)/layout.tsx`) keeps auth guard + `max-w-md`
container + header and drops all Finance nav. The 6 Finance route folders move into a
`(finance)` route group (no URL segment added), and a new `(finance)/layout.tsx` owns the
`NavPill`/`FabMenu`/`OverflowMenu` verbatim. The dashboard relocates to `(finance)/finance/page.tsx`
(`/finance`); `(app)/page.tsx` becomes the hub. Back-to-hub is the header title wrapped in
`<Link href="/">`, added once at the outer level so it works from every screen.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| 1 | Route group `(finance)`, URLs stay bare | Real `/finance/*` prefix | Prefix rewrites ~9 source files, 17 `revalidatePath`/`redirect` calls and 18 test import paths for a cosmetic URL gain; matches health-tracking's already-planned bare `/salud/**` |
| 2 | `AppLayout` stays the outer shell wrapping hub + all modules | Duplicate the shell into each module layout | One auth guard, one container, one back-to-hub link; adding module #2 is one folder + one array entry |
| 3 | Back-to-hub = header title as `<Link href="/">` | Dedicated back button / hub icon in `NavPill` | Zero new UI surface, works from every authenticated screen including ones with no nav; `NavPill` stays module-owned |
| 4 | New `ModuleCard` + `ModuleGrid` in `src/design-system/patterns/` | Add a `variant="grid"` to `QuickActionRow` | `QuickActionRow` has a hard 2–4-action row contract and a `pattern-quick-action-row.test.tsx` asserting it; a variant would fork that contract |
| 5 | Hardcoded `MODULES` array in the hub page | Registry/provider | Consistent with `dashboard-home`'s existing "no card-provider registry" rule |
| 6 | `revalidatePath("/")` → `revalidatePath("/finance")` inside moved actions | Leave as-is; revalidate both | `/` is no longer the dashboard. See "Correction" below |

### Correction to the exploration's "zero content edits" claim

Verified file-by-file. Two claims in `exploration.md` are **false** and the design corrects them.

| File | Verdict |
|---|---|
| `MonthSummaryCard.tsx` (`/movimientos`) | No edit — URL unchanged |
| `BudgetForm.tsx` (`/movimientos`) | No edit |
| `cuentas/nueva/page.tsx` (`/cuentas`) | No edit |
| `DueRecurringBanner.tsx` (default `/recurrentes`) | No edit |
| `AccountsScreen.tsx` (4× `/cuentas/nueva`) | No edit |
| `movimientos/page.tsx` (`` `/movimientos/${id}/editar` ``) | No edit |
| `categorias/actions.ts`, `presupuestos/actions.ts` | No edit — only `/categorias` `/presupuestos` |
| `movimientos/actions.ts` | **EDIT** — 5× `revalidatePath("/")` → `"/finance"` (`redirect("/movimientos")` unchanged) |
| `recurrentes/actions.ts` | **EDIT** — 5× `revalidatePath("/")` → `"/finance"` |
| `cuentas/actions.ts` | **EDIT** — 1× `revalidatePath("/")` → `"/finance"` |
| `(public)/entrar/dev-login-action.ts` | No edit — `redirect("/")` now lands on the hub, intended |
| 18 test files importing `@/app/(app)/{moved}/…` | **EDIT** — specifier becomes `@/app/(app)/(finance)/…` |

All intra-folder relative imports (`./actions`, `../AccountForm`, `../movimientos/OverBudgetDialog`)
stay valid: every participant moves together. `no-household-text.test.ts` recurses from
`src/app/(app)` — unaffected. `boundary-lint.test.ts` has no app-path rule. No test asserts a
`revalidatePath` argument value, so the 11 edits are test-invisible.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/app/(app)/layout.tsx` | Modify | Delete `<NavPill>…</NavPill>` and the `Home/Wallet/Target/Repeat/Layers/CalendarDays`, `Link`, `FabMenu`, `OverflowMenu`, `NavPill` imports. Keep guard, container, `ThemeToggle`. Wrap title: `<Link href="/"><h1 className="text-xl font-semibold">LifeOS</h1></Link>` (keep `next/link` import) |
| `src/app/(app)/(finance)/layout.tsx` | Create | `export default function FinanceLayout({children}) { return <>{children}<NavPill>…</NavPill></> }` — the deleted JSX verbatim, one change: Inicio `href="/"` → `href="/finance"`. Leading comment explaining route groups add no URL segment |
| `src/app/(app)/(finance)/finance/page.tsx` | Create | Current `(app)/page.tsx` byte-for-byte |
| `src/app/(app)/page.tsx` | Rewrite | Hub: `MODULES` array + `<ModuleGrid items={MODULES} />` |
| `src/app/(app)/{movimientos,cuentas,presupuestos,recurrentes,categorias,calendario}/` | Move | → `(app)/(finance)/…`, `git mv`, content untouched except the 11 `revalidatePath` tokens |
| `src/design-system/patterns/ModuleGrid.tsx` | Create | `ModuleCard` + `ModuleGrid` |
| `tests/unit/hub-page-render.test.tsx` | Create | Hub assertions |
| `tests/unit/finance-dashboard-render.test.tsx` | Rename | `home-page-render.test.tsx` renamed; only the import specifier changes |
| 17 other test files | Modify | Import specifier only |

## Interfaces / Contracts

```tsx
// src/design-system/patterns/ModuleGrid.tsx
export interface ModuleItem { label: string; icon: LucideIcon; href: string }
export interface ModuleCardProps extends React.HTMLAttributes<HTMLAnchorElement>, ModuleItem {}
export interface ModuleGridProps extends React.HTMLAttributes<HTMLDivElement> { items: ModuleItem[] }
```

Both `React.forwardRef` + `cn` + `displayName`, matching every sibling pattern. `ModuleCard` is
`<Link>`-wrapped `<Card>` (like `DueRecurringBanner`) with `EmptyState`'s icon badge
(`h-12 w-12 rounded-pill bg-secondary text-secondary-foreground`) above a `text-sm font-medium`
label, `CardContent` `flex-col items-center gap-3 py-8 text-center`, hover
`transition-colors hover:bg-accent/60`. `ModuleGrid` is `grid grid-cols-2 gap-4`. No data props,
no badge/count slot — enforcing "pure launcher".

```tsx
// src/app/(app)/page.tsx
const MODULES: ModuleItem[] = [{ label: "Finanzas", icon: Wallet, href: "/finance" }];
```

## Data Flow

    /          → (app)/layout  → (app)/page.tsx            [hub, no nav]
    /finance   → (app)/layout  → (finance)/layout → page   [dashboard + nav]
    /cuentas   → (app)/layout  → (finance)/layout → page   [unchanged URL]

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `pattern-module-grid.test.tsx` (new) | Renders one card per item; `getByRole("link", {name})` has the right `href`; empty array renders no links |
| Unit | `hub-page-render.test.tsx` (new) | Renders "Finanzas" linking `/finance`; asserts **no** `@/modules/finance/api` mock is needed (page has zero data imports); `queryByRole("navigation")`/FAB absent |
| Unit | `finance-dashboard-render.test.tsx` | The 8 existing `home-page-render` cases verbatim, import from `@/app/(app)/(finance)/finance/page` |
| Unit/Int | 17 remaining files | Import-specifier-only edit; assertions unchanged — proves URLs did not move |
| Manual | `/`, `/finance`, 6 bare routes | Nav present in Finance, absent on hub; title links home |

Two test files, not one: the hub and the dashboard are different pages with disjoint mocks.

## Threat Matrix

Not applicable — this change alters URL routing only. No shell commands, subprocesses, VCS/PR
automation, executable-file classification, or process integration. Documentation-like paths: N/A
(no file classification). Git repository selection / commit state / push state / PR commands: N/A
(no VCS automation; `git mv` is applier tooling guidance, not shipped code).

## Migration / Rollout

No data migration. Sequence for `sdd-tasks` — 4 reviewable, independently bisectable slices:

1. **Pattern only** — `ModuleGrid.tsx` + `pattern-module-grid.test.tsx`. No routing touched; app still works.
2. **Move only** — `git mv` the 6 folders + `git mv` `(app)/page.tsx` → `(app)/(finance)/finance/page.tsx`; create `(finance)/layout.tsx` by moving the JSX out of `AppLayout`; update the 18 test import specifiers + 11 `revalidatePath` tokens; rename `home-page-render.test.tsx`. **No `(app)/page.tsx` exists yet — `/` 404s at the end of this slice**, which is why it must not ship alone to `main` if the branch is deployed; stack it.
3. **Hub** — new `(app)/page.tsx` + `hub-page-render.test.tsx`. `/` works again.
4. **Polish** — title `<Link href="/">`, route-group explanatory comment.

Slices 2–4 can collapse into one PR if the 400-line guard allows; slice 1 stays separate.

**`git mv` is mandatory applier guidance.** A copy+delete makes Git emit ~2,000 delete+add lines and
destroys rename detection. Applier must `git mv` first and commit the move **before** editing the
moved files, then `git diff -M --stat` to confirm renames are detected. Reviewer should read with
`git log --follow` / `git show -M`.

## Open Questions

- [ ] `openspec/changes/health-tracking/design.md` line 162 targets `src/app/(app)/salud/…`; under this design it becomes `src/app/(app)/(health)/salud/…`. Coordination note only — non-blocking, Health's own UI slice owns the fix.
