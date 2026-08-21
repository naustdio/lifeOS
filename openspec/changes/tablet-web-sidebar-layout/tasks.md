# Tasks: Tablet/Web Sidebar Navigation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~800-900 total (~400 per slice) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (registry + layout refactor) -> PR 2 (sidebar + adaptive shell) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Skill: `chained-pr` (gentle-ai-chained-pr registry) applies — split confirmed, each slice independently mergeable to main, ~400 lines each, well under budget individually.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Registry + active-route resolver + ModuleNavPill + 3 layout refactors + hub `MODULES` | PR 1 (targets `main`) | `pnpm vitest run tests/unit/health-layout-nav-render.test.tsx tests/unit/hub-page-render.test.tsx src/shared/navigation` | `pnpm dev`, manual check `/finance`, `/health`, `/recetas`, `/` at 375px | Revert commit restores 4 hardcoded arrays; zero sidebar code exists yet |
| 2 | Sidebar primitive + SidebarNav + adaptive shell + `md:hidden` | PR 2 (targets PR 1 branch) | `pnpm vitest run src/design-system/ui/sidebar.test.tsx src/design-system/patterns/SidebarNav.test.tsx` | `pnpm dev`, manual check 375/768/1024/1280px, exactly one nav surface | Revert commit removes sidebar mount + `md:hidden`; PR 1's mobile UI unaffected |

## PR 1: Registry + Layout Refactor (targets `main`)

### Phase 1: Registry Foundation
- [x] 1.1 RED: write `src/shared/navigation/active-route.test.ts` for `resolveActiveHref` (`/movimientos/1/edit`->`/movimientos`, `/`->null, unknown->null) — implemented at `tests/unit/active-route.test.ts` (see apply-progress deviation: vitest `test.include` only globs `tests/unit/**` and `tests/integration/**`, not colocated `src/**`)
- [x] 1.2 GREEN: create `src/shared/navigation/active-route.ts`, implement longest-prefix match
- [x] 1.3 RED: write registry parity test — frozen literal of today's per-module href/label/placement (finance/health/recipes) vs registry-derived output — `tests/unit/nav-registry-parity.test.ts`
- [x] 1.4 GREEN: create `src/shared/navigation/registry.ts` (`MODULE_NAV`, `NavDestination`, `ModuleNav` types) matching frozen literal

### Phase 2: ModuleNavPill + Layout Refactor (approval-tested)
- [x] 2.1 Safety net: run `health-layout-nav-render.test.tsx`, `hub-page-render.test.tsx`, capture baseline pass count — 6/6 passing before refactor
- [x] 2.2 RED: write `design-system/patterns/ModuleNavPill.test.tsx` (renders pill from `ModuleNav` prop, omits `OverflowMenu` when overflow empty) — `tests/unit/module-nav-pill-render.test.tsx`
- [x] 2.3 GREEN: create `ModuleNavPill.tsx`, port today's pill/FAB/OverflowMenu markup, prop-driven
- [x] 2.4 Refactor `(finance)/layout.tsx` to use registry + `ModuleNavPill`; write `finance-layout-nav-render.test.tsx` mirroring health's
- [x] 2.5 Refactor `(health)/layout.tsx` to use registry + `ModuleNavPill`; `health-layout-nav-render.test.tsx` must pass unmodified
- [x] 2.6 Refactor `(recipes)/layout.tsx` to use registry + `ModuleNavPill`; write `recipes-layout-nav-render.test.tsx` mirroring health's
- [x] 2.7 Refactor `(app)/page.tsx` `MODULES` to derive from `MODULE_NAV`; `hub-page-render.test.tsx` must pass unmodified

### Phase 3: Verification
- [x] 3.1 Run `pnpm test`, `pnpm lint` (boundaries: `app`->`shared` only), `pnpm typecheck` — done via `pnpm test` (516/518, 2 pre-existing unrelated timeout flakes verified passing in isolation) and `pnpm verify` (lint+tsc+tokens+build, all green)

## PR 2: Sidebar + Adaptive Shell (targets PR 1 branch)

### Phase 1: Sidebar Primitive
- [x] 1.1 RED: write `design-system/ui/sidebar.test.tsx` — active item exposes `aria-current="page"`, inactive doesn't — implemented at `tests/unit/sidebar-render.test.tsx` (same vitest `test.include` constraint as PR1: colocated `src/**` tests aren't globbed)
- [x] 1.2 GREEN: create `sidebar.tsx` (`Sidebar`, `SidebarNavItem`), token-based styling
- [x] 1.3 RED: write `design-system/patterns/SidebarNav.test.tsx` (mocked `usePathname`) — active module's destinations only, hub link, `null` at `/` — implemented at `tests/unit/sidebar-nav-render.test.tsx`
- [x] 1.4 GREEN: create `SidebarNav.tsx` (`"use client"`), longest-prefix module match via `active-route.ts`; introduced `SidebarModuleNav`/`SidebarNavDestination` serialized types (icon as `ReactNode`) distinct from the registry's `ModuleNav` (icon as `LucideIcon`) to satisfy decision 5 at the type level, not just by convention

### Phase 2: Adaptive Shell Wiring
- [x] 2.1 Safety net: ran `hub-page-render`, `finance/health/recipes-layout-nav-render` (the tests that exercise `(app)/layout.tsx`'s siblings/consumers) — 12/12 passing before the shell change
- [x] 2.2 Modified `(app)/layout.tsx`: wrapped `md:flex md:justify-center md:gap-8`, mounted `SidebarNav` with icon refs mapped to elements in the Server Component (decision 5), `pb-28` -> `pb-28 md:pb-8`
- [x] 2.3 Added `md:hidden` to `nav-pill.tsx` base class
- [x] 2.4 RED->GREEN: proxy breakpoint tests asserting class strings contain `md:hidden` / `hidden md:flex` — `tests/unit/nav-surface-breakpoint.test.tsx`

### Phase 3: Verification
- [x] 3.1 Extended `tests/e2e/mobile-first-checklist.md` with an "Adaptive Navigation Breakpoint Checklist" section (375/768/1024/1280px, exactly one nav surface) — marked PENDING, requires a human browser pass; the apply agent has no browser access
- [x] 3.2 Ran `pnpm verify` (lint incl. boundaries + `tsc --noEmit` + tokens + build) — all green; `pnpm test` separately — 91/91 files, 526/526 tests passing (518 baseline + 8 new from this PR)

### Phase 4: Live-review amendments (2026-08-21, human browser pass on real device sizes)
- [x] 4.1 Sidebar chrome polish: deduped the "LifeOS" hub link (now "Todos los módulos" + `LayoutGrid` icon, separated by a divider), raised the active-item contrast from `bg-accent` to `bg-primary`/`text-primary-foreground` (same lime chip pattern as `ThemeToggle`), widened item padding, added `border-r` to visually separate the sidebar from content, widened the rail from `w-56` to `w-60`
- [x] 4.2 Amended `module-hub` spec + design.md decision 5: content container no longer pins `max-w-md` at every width — real-device tablet review (iPad Air, 820px) showed a fixed-width column stranded beside the sidebar with the sidebar-narrowing/removal alternatives considered and rejected (the void isn't caused by the sidebar, content just never grows); now `max-w-md` → `md:max-w-2xl` → `lg:max-w-3xl`, a fixed breakpoint cap, not fluid/full-bleed
- [x] 4.3 Added a user-controlled collapse toggle to `SidebarNav` (icon-only button beside "Todos los módulos"; collapsed state renders a small fixed reopen button instead), persisted via `localStorage` (`lifeos:sidebar-collapsed`) so it survives navigation/refresh — RED tests added to `tests/unit/sidebar-nav-render.test.tsx` (collapse toggle renders, collapsing hides nav + shows reopen button, state persists across remounts), then GREEN
- [x] 4.4 Re-ran `pnpm verify` (all green) and `pnpm test` (91/91 files, 529/529 tests, local Supabase back up) after all amendments
