# Exploration: Adapt LifeOS to tablet/web (desktop) with sidebar navigation

## Current State

**Root layout chain** (Next.js 15 App Router, `src/app`):
- `src/app/layout.tsx` — HTML shell, `ThemeProvider` (next-themes, light/dark only, `enableSystem: false`), `ServiceWorkerRegistration`. No width constraint here.
- `src/app/(app)/layout.tsx` — auth guard (redirects to `/entrar` if no Supabase user) + the ONLY width constraint in the app: `mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-28 pt-8`. Header (LifeOS title → `/`, `ThemeToggle`), then `{children}`. Documented as a "Neutral Outer Shell" owning no module-specific nav.
- Three parallel module layouts each duplicate the same bottom-nav pattern independently:
  - `src/app/(app)/(finance)/layout.tsx`
  - `src/app/(app)/(health)/layout.tsx`
  - `src/app/(app)/(recipes)/layout.tsx`
  - Each renders `{children}` + `<NavPill>` (`src/design-system/ui/nav-pill.tsx`, fixed-position floating bottom pill: `fixed inset-x-4 bottom-4 z-50 ... rounded-pill`) with 2-3 direct icon links, a central `FabMenu`, and an `OverflowMenu` ("Más" — client-side disclosure sheet). Route arrays are hardcoded per-layout, not centralized.
- Hub page `src/app/(app)/page.tsx` at `/` renders `ModuleGrid` (2-col grid of 3 `ModuleCard`s: Finanzas → `/finance`, Salud → `/salud`, Recetas → `/recetas`) — no sidebar exists for this hub either.
- `pb-28` bottom padding on the `(app)` shell reserves space for the floating `NavPill` — a mobile-only assumption baked into the shared container.

## Affected Areas
- `src/app/(app)/layout.tsx` — sole width/container constraint (`max-w-md`); primary candidate for a responsive shell.
- `src/app/(app)/(finance|health|recipes)/layout.tsx` (3 files) — each owns its own bottom `NavPill` with hardcoded route/icon arrays; no shared nav-item registry exists to feed a sidebar.
- `src/design-system/ui/nav-pill.tsx` — mobile-only fixed-position primitive; needs a sidebar/rail counterpart, not a reused component.
- `src/design-system/patterns/OverflowMenu.tsx` — only file in the codebase with any responsive Tailwind variant (`sm:items-center`, a stock default breakpoint).
- `src/design-system/patterns/ModuleGrid.tsx` — fixed `grid-cols-2`, no responsive variants.
- `src/app/(app)/page.tsx` — hardcoded 3-item `MODULES` array; conceptually duplicates the per-module nav-route data.
- `src/app/globals.css` / `src/design-system/tokens/*.css` — Tailwind v4 `@theme inline`; no custom breakpoints defined.
- `eslint.config.mjs` `boundaries/element-types` — `design-system` may only import `design-system`/`shared` (cannot hold route data); `app` may import `design-system`, `module-api`, `shared`. This is why NavPill (dumb primitive) lives in design-system while route data lives per-module in `app` — a Sidebar must follow the identical split.
- Every page assumes a `max-w-md` (~448px) column; no responsive grid variants found anywhere for content components (`MonthSummaryCard`, `RecipeCard`, `CalendarGrid`, etc.).

## Responsive Infrastructure Found
- Tailwind v4 (`^4.0.0`), default breakpoints only, none customized.
- Zero JS viewport/media-query hooks (`useMediaQuery`, `matchMedia`) anywhere in `src`.
- Zero CSS container queries.
- No `Sidebar`, `Drawer`, or `NavRail` component exists anywhere (confirmed via grep).
- `manifest.ts`/root `viewport` meta are mobile/PWA-oriented (theme-color for mobile browser chrome).

## Routing Structure
Next.js 15 App Router with route groups (not React Router/Expo Router). `(app)` wraps `(finance)`, `(health)`, `(recipes)` route groups (zero URL segments added). Next.js layouts persist across nested navigation without remounting — favorable for a persistent sidebar placed once at `(app)/layout.tsx`. Real fork: (a) hoist one cross-module sidebar into `(app)/layout.tsx` fed by a new shared nav-item registry keyed by active module, vs. (b) keep per-module nav ownership and have each module layout render both sidebar (desktop) and NavPill (mobile) — 3x duplicated markup per breakpoint.

## Screens/Pages That Would Render Inside an Adaptive Shell
- Hub: `/`
- Finance: `/finance`, `/movimientos` (+edit), `/cuentas` (+new/edit), `/presupuestos`, `/recurrentes`, `/categorias`, `/calendario`
- Health: `/salud`, `/signos`, `/nutricion` (+detail), `/perfil`
- Recipes: `/recetas` (+detail/edit)

## State the Shell Would Need
- Auth/user — Supabase server client already fetched in `(app)/layout.tsx`.
- Theme — `next-themes`, already app-wide.
- Active pathname (for nav highlighting) — currently `usePathname()` client-side in `OverflowMenu`.
- No existing global module/nav registry — new data structure work.

## Risks/Complexity
- **Greenfield responsive work** — no breakpoint infra of any kind exists; no page has been verified beyond `max-w-md`.
- **Per-module nav duplication**: 3 layouts hardcode separate route arrays; centralizing vs. triplicating for the sidebar is a real design fork with different blast radii.
- **Architectural boundary constraint** (`eslint-plugin-boundaries`) forces sidebar route data to live in `app`, not `design-system`.
- **Project convention conflict**: `openspec/config.yaml` explicitly describes LifeOS as "mobile-first" and instructs specs to be "Mobile-first: scenarios should account for small-viewport behavior" — this change revises that stated posture; proposal should address it explicitly.
- **No responsive content-layout precedent**: if scope extends beyond nav (e.g., multi-column dashboards on desktop) that's substantially larger than "just add a sidebar."
- **No layout/responsive test coverage** — verification would be manual/visual unless new tooling is added.

## Ready for Proposal
Yes. Findings are conclusive: net-new responsive layer, with a genuine fork on (1) where sidebar nav data is centralized and (2) whether scope covers nav-only vs. full content reflow. Surface this scope question before design.
