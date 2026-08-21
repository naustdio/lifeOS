# Design: Tablet/Web Sidebar Navigation

## Technical Approach

One nav-item registry in `shared`, two dumb rendering surfaces in `design-system`, one adaptive shell in `(app)/layout.tsx`. Breakpoint switching is pure CSS (`md:` = 768px); both surfaces render server-side, `display:none` hides the inactive one — no viewport hook, no hydration flash, and `hidden` also removes the inactive nav from the a11y tree. Content keeps `max-w-md` at every width (decision 5).

## Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| 1 | Registry location | `src/shared/navigation/registry.ts` (data) + `active-route.ts` (pure resolver) | `src/app/(app)/_nav/` | `app → app` is **not** in `boundaries/element-types` allow-list and `default: "disallow"`; no app→app import exists in the repo today. `app → shared` is proven (`@/shared/supabase/server`). `design-system` may import `active-route` (pure fn) but never `registry`. |
| 2 | Sidebar layer split | `design-system/ui/sidebar.tsx` (dumb chrome) + `design-system/patterns/SidebarNav.tsx` (`"use client"`, prop-driven, owns `usePathname`) | Smart sidebar in `app` | Exact `OverflowMenu` precedent: client pattern, `usePathname`, zero route data — boundary-clean. |
| 3 | Active module selection | Client-side, inside `SidebarNav`, from `usePathname()` over the whole passed registry | Server-side per-module layouts | Server layouts get no pathname in App Router; server selection would force triplicated sidebars (proposal rejects). |
| 4 | Hub `/` no-nav | Falls out of #3: no module matches `/` → `SidebarNav` returns `null` | Explicit route check in the shell | Invariant is structural, not a special case; `module-hub` neutrality preserved by construction. |
| 5 | Icon transport | Registry stores `LucideIcon` refs; server maps to `<Icon/>` **elements** before the client boundary | Pass component refs | Documented RSC failure in `OverflowMenu.tsx`: functions are not serializable, elements are. |
| 6 | Mutual exclusivity | `md:hidden` baked into `NavPill`'s base class (one file) | `md:hidden` on 3 module layouts | Single source of truth for "exactly one nav surface"; FabMenu + OverflowMenu vanish with the pill, satisfying decision 3 free. |
| 7 | Mobile pill dedup | New `design-system/patterns/ModuleNavPill.tsx` (server component) fed by the registry | Keep 3 hand-written pills | Removes ~120 duplicated lines; layouts shrink to a lookup. Server component keeps the icon-ref → element mapping in #5. |

## Data Flow

    shared/navigation/registry.ts  (MODULE_NAV: data only)
        │
        ├─→ (app)/page.tsx ────────────→ ModuleGrid           (hub cards)
        ├─→ (finance|health|recipes)/layout.tsx ─→ ModuleNavPill  (mobile, <768px)
        └─→ (app)/layout.tsx ──serialize icons──→ SidebarNav      (>=768px, client)
                                                      │
                                          active-route.ts (longest-prefix)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/shared/navigation/registry.ts` | Create | `MODULE_NAV` — single source of truth |
| `src/shared/navigation/active-route.ts` | Create | `resolveActiveHref(pathname, hrefs)` longest-prefix match |
| `src/design-system/ui/sidebar.tsx` | Create | `Sidebar` (`hidden md:flex w-56 shrink-0 md:sticky md:top-0 md:h-screen`) + `SidebarNavItem` (`active` prop → `aria-current="page"`) |
| `src/design-system/patterns/SidebarNav.tsx` | Create | `"use client"`; picks active module, renders hub link + its destinations; `null` when no module matches |
| `src/design-system/patterns/ModuleNavPill.tsx` | Create | Today's pill markup, prop-driven; omits `OverflowMenu` when `overflow` is empty (recipes) |
| `src/design-system/ui/nav-pill.tsx` | Modify | Add `md:hidden` to base class |
| `src/app/(app)/layout.tsx` | Modify | Wrap in `md:flex md:justify-center md:gap-8`; mount `SidebarNav`; `pb-28` → `pb-28 md:pb-8` |
| `src/app/(app)/(finance\|health\|recipes)/layout.tsx` | Modify | Replace hardcoded arrays with `ModuleNavPill` + registry lookup |
| `src/app/(app)/page.tsx` | Modify | `MODULES` derived from `MODULE_NAV` |

## Interfaces / Contracts

```ts
export type NavDestination = {
  href: string; label: string; icon: LucideIcon;
  placement: "primary" | "overflow"; // mobile pill grouping; sidebar shows both
};
export type ModuleNav = {
  id: "finance" | "health" | "recipes";
  label: string; href: string; icon: LucideIcon;
  fab: { href: string; label: string };   // mobile-only, sidebar ignores it
  destinations: NavDestination[];
};
export const MODULE_NAV: readonly ModuleNav[];
```

Shell (≥md, sidebar present → sidebar+content centre together; absent → content centres alone, i.e. today's layout):

```tsx
<div className="md:flex md:justify-center md:gap-8">
  <SidebarNav modules={serialized} />
  <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 pb-28 pt-8 md:max-w-2xl md:pb-8 lg:max-w-3xl">…</div>
</div>
```

**Decision 5 (amended 2026-08-21):** the content column no longer pins `max-w-md` at every width.
Real-device review at tablet width (iPad Air, 820px) showed the original fixed-`max-w-md` column
sitting in a large dead void beside the sidebar — narrowing the sidebar or removing it doesn't fix
that, since the column would stay 448px regardless of available space. The column now widens on a
fixed breakpoint curve (`max-w-md` → `md:max-w-2xl` → `lg:max-w-3xl`), not fluidly/full-bleed, so
existing content components (which assume a narrow single-column measure) aren't stretched into
unintentional layouts. This does not become general "content reflow": components themselves are
untouched, only the outer cap they render inside.

## Testing Strategy

Strict TDD, `pnpm test` (vitest). RED first.

| Layer | What | Approach |
|---|---|---|
| Unit | `resolveActiveHref` | `/movimientos/1/edit`→`/movimientos`; `/`→`null`; unknown→`null` |
| Unit | **Registry parity (regression guard)** | Frozen literal of today's per-module href/label/placement lists asserted against registry-derived output |
| Unit | `SidebarNav` | RTL + mocked `usePathname`: active module only, `aria-current`, `null` at `/` |
| Unit | Module layouts | New `finance-`/`recipes-layout-nav-render` mirroring existing `health-layout-nav-render.test.tsx`; existing health + `hub-page-render` tests must pass **unmodified** |
| Unit (proxy) | Breakpoint | jsdom cannot evaluate CSS — assert class strings contain `md:hidden` / `hidden md:flex` |
| Manual | Visual | Extend `tests/e2e/mobile-first-checklist.md`: 375 / 768 / 1024 / 1280 px, exactly one nav surface |

**Limit:** no automated responsive or visual-regression coverage exists or is added; breakpoint correctness is verified manually.

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Routes are static literals; no dynamic redirect, no user input reaches an `href`.

## Migration / Rollout

No migration. No new dependency, no persisted state, no route rename. Single revert restores hardcoded arrays and the unconditional shell.

**Review budget forecast: ~800–900 changed lines — exceeds the 400-line budget (risk: High).** Recommend two stacked slices:
1. Registry + `active-route` + `ModuleNavPill` + refactor 3 layouts + hub page + parity tests (~400). Zero visual change at any width; independently shippable.
2. Sidebar primitive + `SidebarNav` + adaptive shell + `NavPill md:hidden` + sidebar tests + delta specs (~400).

## Open Questions

- [ ] None blocking. If a spike proves `app → app` imports pass `pnpm lint`, moving the registry to `src/app/(app)/_nav/` is a pure file move (decision 1).
