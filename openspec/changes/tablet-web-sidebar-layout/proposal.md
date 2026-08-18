# Proposal: Tablet/Web Sidebar Navigation

## Intent

LifeOS is usable only as a ~448px column (`max-w-md`). On tablet and desktop the app renders a narrow strip in a wide viewport, and the only way to move between module screens is the floating mobile `NavPill` — a bottom-anchored control that reads as a phone affordance on a pointer device. Users working from a laptop or tablet get no persistent orientation: no visible module map, no always-on destination list, no sense of where they are. This change adds a persistent sidebar for tablet/desktop while leaving mobile untouched.

Secondary driver: the three module layouts (`(finance)`, `(health)`, `(recipes)`) each hardcode their own route/icon arrays, and `(app)/page.tsx` hardcodes a fourth `MODULES` array. Adding a sidebar without centralizing this would create a fifth and sixth copy.

## Scope

### In Scope
- Shared nav-item registry (route, icon, label, module) in the `app` layer, consumed by both `NavPill` (mobile) and the new sidebar.
- Refactor the 3 module layouts + `(app)/page.tsx` `MODULES` to consume the registry instead of local arrays — no behavior change on mobile.
- New sidebar presentation primitive in `design-system/ui` (dumb, data-injected), rendering module + in-module destinations with active-route highlighting.
- Adaptive shell at `src/app/(app)/layout.tsx`: mobile keeps `max-w-md` + `pb-28` + `NavPill`; at/above a tablet breakpoint the sidebar renders and the mobile pill and its bottom padding are suppressed.
- Breakpoint convention documented once (Tailwind default `md`/`lg` unless a custom token is justified).

### Out of Scope (explicit non-goals)
- Content-layout reflow: no multi-column dashboards, no wider grids, no `ModuleGrid`/card responsive variants. Page content keeps its current single-column composition, centered in the remaining space. Candidate for a follow-up change.
- Editing `openspec/config.yaml` — mobile-first stays the documented primary posture; this is an additive adaptive layer, matching the existing `design-system` "Mobile-First Layout" requirement that already calls desktop a responsive enhancement.
- Redesigning `NavPill`, `FabMenu`, or `OverflowMenu` behavior on mobile.
- Collapsible/resizable sidebar, persisted collapse state, keyboard-shortcut navigation.
- New responsive test tooling (Playwright/visual regression).

## Business Rules

- Mobile (below the tablet breakpoint) MUST render exactly today's UI — same pill, same padding, same routes.
- Exactly one navigation surface is visible at any viewport width; never both pill and sidebar.
- The hub `/` MUST keep its "no module nav" neutrality (`module-hub` spec): at desktop it may show module-level entries only, never a module's in-module destinations.
- Route addresses stay byte-identical; this change adds no routes and renames none.
- Sidebar is auth-gated by the existing `(app)` guard — no new permission surface.

## Capabilities

### New Capabilities
- `adaptive-navigation`: viewport-adaptive navigation surface selection (mobile pill vs. tablet/desktop sidebar) and the shared nav-item registry that feeds both.

### Modified Capabilities
- `module-hub`: "Neutral Outer Shell" pins the shell to `max-w-md` + bottom-pill padding; must be restated as breakpoint-conditional. "Finance Nested Layout Owns Finance Nav" must allow registry-sourced route data instead of inline JSX arrays.
- `design-system`: "Base Component Set" gains a sidebar primitive; "Mobile-First Layout" gains an explicit tablet/desktop enhancement scenario.

## Approach

Hoist one cross-module navigation surface into `src/app/(app)/layout.tsx` (fork option (a) from exploration) rather than triplicating sidebar markup across the three module layouts. Next.js route groups make `(app)/layout.tsx` persist across all module navigation without remounting, so a single sidebar instance survives route changes for free. The shell derives the active module and its destinations from the shared registry plus the active pathname.

The `NavPill`/route-data split is mirrored exactly: rendering lives in `design-system/ui` (which `eslint-plugin-boundaries` forbids from holding route data), the registry lives in the `app` layer. Breakpoint switching is CSS-first (Tailwind responsive utilities) rather than a JS media-query hook, so there is no hydration flash and no new client-side viewport state.

Design phase decides: registry file location and shape, breakpoint value, whether the sidebar is a server or client component, and how active-route highlighting is computed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/(app)/layout.tsx` | Modified | Adaptive shell: conditional width, padding, sidebar mount |
| `src/app/(app)/(finance\|health\|recipes)/layout.tsx` | Modified | Consume registry instead of hardcoded route arrays |
| `src/app/(app)/page.tsx` | Modified | `MODULES` sourced from registry |
| `src/app/<nav registry>` (new) | New | Shared nav-item registry in `app` layer |
| `src/design-system/ui/sidebar.tsx` | New | Dumb sidebar primitive |
| `src/design-system/ui/nav-pill.tsx` | Modified | Accepts registry-shaped items; visual behavior unchanged |
| `openspec/specs/module-hub`, `design-system` | Modified | Delta specs |

## Edge Cases

- Hub `/` at desktop: sidebar shows modules only, no in-module destinations.
- Tablet portrait vs. landscape straddling the breakpoint: CSS-only switching means no state loss on rotation.
- Deep routes (`/movimientos/[id]/edit`, `/recetas/[id]`): active highlighting must resolve to the parent destination, not fail to match.
- `OverflowMenu` ("Más") destinations: on desktop these become first-class sidebar entries — the registry must mark overflow-vs-primary so mobile grouping survives.
- Very wide viewports: content stays a centered readable column; sidebar must not stretch content beyond its designed width.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Registry refactor regresses mobile nav on one of 3 modules | Med | Registry must be a pure data move; diff each layout's rendered item list against current hardcoded array before/after |
| Sidebar + pill both visible at a breakpoint edge | Med | Single source of truth for the breakpoint; mutually exclusive `hidden`/`md:flex` pairing, not two independent conditions |
| `pb-28` removal at desktop leaves content misaligned | Low | Padding becomes breakpoint-scoped in the same commit as the sidebar mount |
| Boundary lint violation if registry lands in `design-system` | Low | `pnpm lint` enforces it; approach already places registry in `app` |
| Scope creep into content reflow | Med | Non-goals are explicit; content components are out of the diff |
| No automated responsive coverage — verification is visual | High | Accept for this change; unit-test the registry and active-route resolver, verify layout manually at 375/768/1280px |

## Rollback Plan

Single revert. The change is additive plus one data refactor: reverting the commit restores the hardcoded per-layout route arrays and the unconditional `max-w-md`/`pb-28` shell. No database migration, no route rename, no persisted user state, no dependency added — nothing survives a revert. If only the sidebar misbehaves, an intermediate rollback is to keep the registry refactor and remove the sidebar mount plus breakpoint-conditional shell classes.

## Dependencies

- None external. No new packages expected (Tailwind v4 default breakpoints suffice).
- Depends on `openspec/specs/module-hub` and `design-system` deltas being authored in the spec phase.

## Success Criteria

- [ ] At <768px the app renders byte-equivalent UI to today (pill, `max-w-md`, `pb-28`); existing unit tests pass unchanged.
- [ ] At tablet/desktop widths a persistent sidebar is visible on every `(app)` route, with the current route highlighted.
- [ ] Exactly one nav surface is visible at every tested width (375, 768, 1024, 1280px).
- [ ] All three module layouts and the hub read destinations from one registry; zero hardcoded route arrays remain in layouts.
- [ ] Sidebar persists across in-module navigation without remount/flash.
- [ ] `pnpm verify` (lint incl. boundaries + `tsc --noEmit` + tests) passes.
- [ ] No page-content component gained a responsive variant (non-goal held).
