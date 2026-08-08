# Proposal: Neutral module hub at `/` + per-module navigation (app-module-hub)

## Intent

LifeOS is a multi-module app whose shell only knows Finance. `/` **is** the Finance dashboard, and
`AppLayout` hardcodes a Finance `NavPill`/`FabMenu`/`OverflowMenu` onto every authenticated route.
There is no way to reach a second module. `health-tracking` — the first non-Finance module — is
blocked on this: it has nowhere to be launched from and no place to put its own nav.

## Scope

### In Scope
- Neutral hub screen at `/`: module-card grid, no bottom nav, no FAB. Ships a Finance card → `/finance`
  (Health card added later by Health's own UI slice; the grid is data-driven and extensible).
- `AppLayout` (`src/app/(app)/layout.tsx`) becomes neutral: auth guard + `max-w-md` container + header only.
- `(finance)` route group: the 6 Finance route folders (`movimientos`, `cuentas`, `presupuestos`,
  `recurrentes`, `categorias`, `calendario`) move under `src/app/(app)/(finance)/`. URLs stay bare and
  unchanged. New `(finance)/layout.tsx` carries the existing nav JSX verbatim.
- Dashboard relocates to `(finance)/finance/page.tsx` → `/finance`; "Inicio" in Finance's nav now means `/finance`.
- New `ModuleGrid`/`ModuleCard` pattern in `src/design-system/patterns/`.
- Rewrite `tests/unit/.../home-page-render.test.tsx`.

### Out of Scope
- `(health)/layout.tsx` or any Health UI — Health's own slice replicates the proven pattern.
- Option A (real `/finance/*` URL prefix) — rejected on blast radius.
- Any change to the 6 moved folders' internals, Server Actions, `revalidatePath`/`redirect` calls, or the
  other 21 route-asserting tests.

## Capabilities

### New Capabilities
- `module-hub`: neutral authenticated shell, hub launcher at `/`, per-module nav ownership.

### Modified Capabilities
- `dashboard-home`: the Finance dashboard's canonical route becomes `/finance`, not `/`.
- `module-architecture`: adds the UI-layer boundary rule — each module owns a `(module)` route group and its own nested layout.

## Approach

Next.js nested layouts do the work. Nav JSX moves down one level unchanged; route groups add no URL
segment, so all existing Finance URLs, actions and tests keep passing. `FabMenu` needs zero code
changes — its "new transaction" meaning lives in the caller's wrapping `<Link href="/movimientos">`.
Module discovery is a hardcoded array, not a registry: consistent with `dashboard-home`'s existing
"no card-provider registry" decision.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/(app)/layout.tsx` | Modified | Strips all Finance nav JSX |
| `src/app/(app)/page.tsx` | Modified | Becomes the hub |
| `src/app/(app)/(finance)/layout.tsx` | New | Finance nav |
| `src/app/(app)/(finance)/finance/page.tsx` | New | Relocated dashboard |
| 6 Finance route folders | Moved | Path only, zero content diff |
| `src/design-system/patterns/ModuleGrid.tsx` | New | Hub card grid |
| `tests/.../home-page-render.test.tsx` | Modified | Rewritten for the hub |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Route-name collision between future modules (deferred, not eliminated) | Med | Finance/Health vocab does not overlap; revisit at module #3 |
| Route groups are invisible when scanning the tree | Med | Explanatory comment in `(finance)/layout.tsx` |
| A folder move is misread as a rewrite in review | Med | Move-only commit, separate from new files |
| Losing the "back to hub" affordance from inside a module | Med | `sdd-design` must specify it |

## Rollback Plan

Single revert. Move the 6 folders back to `src/app/(app)/`, restore the nav JSX into `AppLayout`,
restore the dashboard body to `page.tsx`, delete `(finance)/` and `ModuleGrid.tsx`. No schema, data,
or Server Action change to undo.

## Dependencies

None blocking. `health-tracking` consumes this pattern but does not gate it.

## Success Criteria

- [ ] `/` renders the hub: module cards, no `NavPill`, no FAB.
- [ ] `/finance` renders the previous dashboard unchanged.
- [ ] `/movimientos`, `/cuentas`, `/presupuestos`, `/recurrentes`, `/categorias`, `/calendario` resolve unchanged with Finance nav visible.
- [ ] All existing tests pass except the rewritten `home-page-render.test.tsx`.
- [ ] Adding a second module requires only a new `(module)/layout.tsx` plus one hub-array entry.
