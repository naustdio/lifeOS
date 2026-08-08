# Exploration: Neutral module hub at `/` + per-module nav swap (app-module-hub)

## Current State

`src/app/(app)/layout.tsx` (`AppLayout`) is the single authenticated shell for every route today: auth guard (defense-in-depth; `src/middleware.ts` is the primary guard and has zero hardcoded Finance route assumptions), the `max-w-md` shell + header, and — in the same component — a `NavPill` hardcoded entirely to Finance (Inicio → `/`, FAB → `/movimientos`, Cuentas → `/cuentas`, Overflow → `/presupuestos`, `/recurrentes`, `/categorias`, `/calendario`).

`src/app/(app)/page.tsx` IS the Finance dashboard (hero, quick actions, debt/due-soon cards, month summary, category spend, recent transactions, accounts, savings goals, sign-out). No neutral home exists.

Full grep of every hardcoded Finance-route reference (`href=`, `redirect(`, `revalidatePath(`):
- `layout.tsx` — 6 hrefs
- `page.tsx` — 3 quick-action hrefs + 2 inline links
- `MonthSummaryCard.tsx`, `BudgetForm.tsx`, `cuentas/nueva/page.tsx` — 1 hardcoded link each
- `DueRecurringBanner.tsx` — 1 overridable default prop
- `AccountsScreen.tsx` — 4 links
- `movimientos/page.tsx` — 1 dynamic link
- `{movimientos,cuentas,presupuestos,recurrentes,categorias}/actions.ts` — ~15 `revalidatePath` + 2 `redirect` calls
- 22 test files under `tests/unit/` and `tests/integration/` assert on these literal route strings

`QuickActionRow.tsx` is the closest existing precedent for the hub's module-card grid (icon-button + label, `Link`-wrapped, "no placeholder hrefs" constraint) — a row, not a grid, but the right base to adapt rather than reinvent. `EmptyState.tsx` confirms the icon-in-`Card` visual language. `FabMenu.tsx` is a dumb shape component — its "new transaction" meaning lives entirely in the caller's wrapping `<Link href="/movimientos">`, so it's trivially reusable per module with zero parameterization needed.

`openspec/changes/health-tracking/proposal.md` already commits to `src/app/(app)/salud/**` — i.e., it already assumed a **bare** `/salud` URL segment, not a `/health/*`-prefixed namespace. This constrains the route-mechanism decision below.

Confirmed: Next.js `^15.5.0` (App Router).

## Affected Areas

- `src/app/(app)/layout.tsx` — loses all Finance nav JSX, becomes neutral shell
- `src/app/(app)/page.tsx` — becomes the hub; dashboard body relocates
- New Finance-scoped layout + relocated dashboard page (mechanism-dependent path)
- 6 existing Finance route folders (`movimientos`, `cuentas`, `presupuestos`, `recurrentes`, `categorias`, `calendario`) — need to move under a Finance module boundary
- `MonthSummaryCard.tsx`, `DueRecurringBanner.tsx`, `BudgetForm.tsx`, `cuentas/nueva/page.tsx`, `AccountsScreen.tsx`, `movimientos/page.tsx` — only need edits if the real-URL-prefix option is chosen
- `{movimientos,cuentas,presupuestos,recurrentes,categorias}/actions.ts` — same conditional blast radius
- 22 test files — same conditional blast radius; `home-page-render.test.tsx` needs a rewrite regardless of which option wins
- `src/middleware.ts` — NOT affected either way
- `openspec/changes/health-tracking/proposal.md` / `design.md` — only `proposal.md` was read; may need a coordination note

## Approaches

1. **Option A — real `/finance/*` URL prefix (plain folder move)** — move all 6 route folders + dashboard under `src/app/(app)/finance/`.
   - Pros: URL clearly signals "you're in Finance"; avoids future route-name collisions across modules.
   - Cons: touches ~9 non-trivial source files with hardcoded route strings, 15+ Server Action `revalidatePath`/`redirect` calls, and most of 22 existing tests. Genuine multi-file refactor.
   - Effort: Medium-High.

2. **Option B — Next.js route group `(finance)`, URLs stay bare** — move the 6 folders into `src/app/(app)/(finance)/`; route groups don't add a URL segment, so `/movimientos`, `/cuentas`, etc. resolve unchanged. The dashboard can't reuse bare `page.tsx` inside the group (would collide with the hub's own `page.tsx` at `/`), so it needs one deliberate new segment: `(finance)/finance/page.tsx` → `/finance`.
   - Pros: zero changes to any of the 6 moved folders' internal content, their Server Actions, or the 22 tests asserting those existing route strings — because those URLs don't change. Matches health-tracking's already-planned bare `/salud/**`.
   - Cons: URLs stay generic (no visual "Finance" signal); defers, doesn't eliminate, future route-name collision risk; route groups (parens) are easy to miss scanning the file tree.
   - Effort: Low.

3. **Option C — leave routes untouched, dashboard stays at `/`** — rejected outright; impossible given the user's already-confirmed decision that `/` becomes the hub. Recorded only for completeness.

## Recommendation

**Option B**, based on measured blast radius, not preference: Option A requires touching ~9 files + most of 22 tests purely for a URL-prefix cosmetic; Option B achieves the identical layout-swap goal with 2 new files + ~2 href edits, and it matches health-tracking's already-assumed bare `/salud/**` shape with zero coordination cost. Flag explicitly to the user in `sdd-propose`: Option B defers rather than eliminates the route-name-collision risk between future modules — acceptable now since Finance/Health vocab doesn't overlap.

**Central architectural answer**: `AppLayout` becomes the neutral outer shell (auth guard + container + header, zero `NavPill`). Each module gets its own nested layout one level down (`(finance)/layout.tsx` now, `(health)/layout.tsx` later) rendering its own `NavPill`/`FabMenu`/`OverflowMenu` — Next.js's native nested-layout mechanism, and `NavPill`'s `fixed` positioning is unaffected by additional wrapping layouts. The hub at `/` therefore has **no bottom nav** — it's a launcher; "quick action" is inherently module-scoped. `FabMenu` moves into `(finance)/layout.tsx` unchanged.

## Risks

- Choosing Option A without budgeting the full blast radius risks blowing the 400-line review-workload guard on one PR — would need `sdd-tasks` to slice it.
- `home-page-render.test.tsx` needs a full rewrite regardless of option.
- Route groups are non-obvious to a first-time reader; worth an explanatory code comment.
- This exploration only read `health-tracking/proposal.md`, not its `design.md`/specs — a quick re-check by `sdd-propose`/`sdd-design` is warranted.
- "Hub has no bottom nav" is this exploration's recommendation, not yet a user-confirmed decision.

## Open Questions for sdd-propose / sdd-design

1. Does the hub screen have a bottom `NavPill` at all? (Recommend no — not yet confirmed by user.)
2. Route mechanism: Option B (route group, low blast radius) vs Option A (real prefix, higher blast radius, clearer semantics) — needs explicit user sign-off.
3. Exact hub grid component: adapt `QuickActionRow` into a grid variant, or compose a new `ModuleCard`/`ModuleGrid` from `Card`/`EmptyState`'s icon-badge pattern?
4. Does Finance's "Inicio" link change meaning to `/finance` (module-home), and if the hub has no nav pill, what's the "back to hub" affordance from inside a module?
5. Should this change also touch `health-tracking`'s spec/design to pre-confirm the `(health)` route-group shape, or leave that to Health's own future UI slice?

## Ready for Proposal

Yes — concrete enough for `sdd-propose`. Resolve open questions #1 and #2 with the user during proposal shaping, not silently in design.
