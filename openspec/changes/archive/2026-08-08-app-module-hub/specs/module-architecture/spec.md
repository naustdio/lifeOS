# Delta for Module Architecture

## ADDED Requirements

### Requirement: UI-Layer Route-Group Boundary
Each module MUST own a Next.js route group `(module-name)` under `src/app/(app)/` and MUST provide
its own nested layout for any module-specific navigation (bottom nav, FAB, overflow menu). The
outer, shared `AppLayout` MUST NOT render nav elements belonging to any single module.

#### Scenario: Finance owns its route group and nav
- GIVEN Finance's six routes and `/finance` live under `src/app/(app)/(finance)/`
- WHEN `(finance)/layout.tsx` is inspected
- THEN it is the sole owner of Finance's `NavPill`/`FabMenu`/`OverflowMenu` JSX, and the outer
  `AppLayout` contains none of it

#### Scenario: A second module follows the same boundary
- GIVEN a future module adds `src/app/(app)/(health)/layout.tsx` with its own nav
- WHEN both modules' routes render
- THEN each module's nav is scoped to its own route group and never leaks into the outer shell or
  another module's routes
