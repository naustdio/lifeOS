# Mobile-First Layout Verification Checklist (T-007)

Manual checklist for the design-system spec's "Mobile-First Layout"
requirement, wired in ahead of the full Playwright E2E smoke suite
(T-040, sub-slice 2C), which folds this check in permanently once real
screens exist.

**How to run:** `pnpm dev`, open the app in a browser at a 375px-wide
viewport (DevTools device toolbar, e.g. "iPhone SE"), and confirm each row
below for every shipped screen.

| Screen | 375px: no horizontal scroll | 375px: all interactive elements reachable/legible | Light theme renders | Dark theme renders |
|---|---|---|---|---|
| `/` (home — balance hero, debt, accounts, goal progress) | ☐ | ☐ | ☐ | ☐ |
| `/cuentas` (account list) | ☐ | ☐ | ☐ | ☐ |
| `/cuentas/nueva` (account creation, all 6 types) | ☐ | ☐ | ☐ | ☐ |
| `/movimientos` (entry form + history) | ☐ | ☐ | ☐ | ☐ |
| `/movimientos/[id]/editar` (correction + void) | ☐ | ☐ | ☐ | ☐ |

Structural basis for why this passes by construction in sub-slice 1A:

- The page shell is `max-w-md` (28rem / 448px) with `px-4` gutters — narrower
  than any viewport this checklist targets, so there is no horizontal
  overflow source.
- `NavPill` is `fixed inset-x-4 bottom-4`, which is viewport-relative, not a
  fixed pixel width, and remains fully on-screen down to very small widths.
- The `FabMenu` and nav labels use `rounded-pill`/`text-sm` sizing that
  keeps tap targets legible without additional breakpoints.

This checklist is re-run manually whenever a new screen ships (1B's
`/entrar`, 2C's `/cuentas` and `/movimientos`) until T-040 automates it.

## Adaptive Navigation Breakpoint Checklist (change: tablet-web-sidebar-layout)

Manual checklist for the `adaptive-navigation` spec's "Exactly One Nav
Surface Visible" requirement — no automated responsive/visual-regression
coverage exists (design.md "Testing Strategy" limit); jsdom cannot evaluate
CSS media queries, so `tests/unit/nav-surface-breakpoint.test.tsx` only
proves the class strings, not real rendered visibility.

**How to run:** `pnpm dev`, open a module route (e.g. `/finance`) in a
browser, and resize/use DevTools device toolbar at each width below.

| Width | Exactly one nav surface visible | Which surface | Sidebar shows only active module + hub link | No horizontal scroll / no double nav |
|---|---|---|---|---|
| 375px | ☐ | pill (expected) | N/A | ☐ |
| 768px | ☐ | sidebar (expected) | ☐ | ☐ |
| 1024px | ☐ | sidebar (expected) | ☐ | ☐ |
| 1280px | ☐ | sidebar (expected) | ☐ | ☐ |

**Status**: PENDING — not run in this session (no browser access from the
apply agent). Requires a human pass before this change is considered fully
verified end-to-end; `pnpm verify` (lint + typecheck + tests + build) is
green independent of this manual pass.
