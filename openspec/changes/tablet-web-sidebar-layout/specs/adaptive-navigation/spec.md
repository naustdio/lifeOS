# Adaptive Navigation Specification

## Purpose

Defines the viewport-adaptive navigation surface for the `(app)` shell — a shared nav-item
registry, plus the rule that exactly one of two rendering surfaces (mobile pill vs.
tablet/desktop sidebar) is visible at any given viewport width, switching at the `md` (768px)
breakpoint.

## Requirements

### Requirement: Shared Nav-Item Registry

The system MUST define a single nav-item registry (route, icon, label, module) that is the sole
source of truth for navigation data. Both the mobile nav surface and the tablet/desktop sidebar
MUST consume this registry; neither MUST hold its own hardcoded route/icon/label array.

#### Scenario: Mobile and sidebar render from the same data
- GIVEN the nav-item registry lists Finance's destinations
- WHEN the mobile pill renders on Finance and the sidebar renders on Finance
- THEN both surfaces list the identical set of destinations sourced from the registry, not from
  independent per-component arrays

#### Scenario: Adding a destination requires one registry edit
- GIVEN a module gains a new in-module screen
- WHEN the screen is added to the registry
- THEN both the mobile pill and the sidebar reflect the new destination without any
  component-level code change

### Requirement: Breakpoint-Based Surface Selection

The system MUST render the mobile bottom nav (`NavPill`) below a 768px (`md`) viewport width, and
MUST render the sidebar at 768px and above. Selection MUST be CSS-based (no client-side viewport
detection required) so that switching is immediate on resize.

#### Scenario: Narrow viewport shows the pill
- GIVEN the viewport is narrower than 768px
- WHEN any `(app)` route renders
- THEN `NavPill` is visible and the sidebar is not rendered/visible

#### Scenario: Tablet-portrait viewport shows the sidebar
- GIVEN the viewport is exactly 768px wide
- WHEN any `(app)` route renders
- THEN the sidebar is visible and `NavPill` is not visible

#### Scenario: Desktop viewport shows the sidebar
- GIVEN the viewport is 1024px or wider
- WHEN any `(app)` route renders
- THEN the sidebar is visible and `NavPill` is not visible

#### Scenario: Rotating across the breakpoint switches surfaces without state loss
- GIVEN a tablet is held in portrait at 768px (sidebar visible) and rotated to a width below 768px
- WHEN the viewport crosses the breakpoint
- THEN the pill becomes visible and the sidebar becomes hidden immediately, with no navigation
  state lost and no full page reload required

### Requirement: Exactly One Nav Surface Visible

At any single viewport width, exactly one of `NavPill` or the sidebar MUST be visible. The two
surfaces MUST NOT both render visibly at the same width, and MUST NOT both be hidden at the same
width.

#### Scenario: No double nav at the breakpoint edge
- GIVEN the viewport is set to widths just below, at, and just above 768px
- WHEN each width is inspected
- THEN exactly one nav surface is visible at each width, never zero and never two

### Requirement: Sidebar Scoped to Active Module

The sidebar MUST show only the active module's destinations plus a link back to the hub (`/`). It
MUST NOT list all modules' destinations simultaneously.

#### Scenario: Sidebar on a Finance route shows Finance destinations only
- GIVEN a user is on `/movimientos` (Finance)
- WHEN the sidebar renders at >=768px
- THEN it shows Finance's destinations and a hub link, and no Health or Recipes destinations

#### Scenario: Switching modules updates the sidebar without remounting the shell
- GIVEN a user is on a Finance route with the sidebar visible
- WHEN they navigate to a Health route via the hub or a direct link
- THEN the sidebar now shows Health's destinations, the shell persists (no full-page nav flash),
  and the previous Finance destinations are no longer listed

### Requirement: Hub Route Shows No Module Destinations in the Sidebar

At `/`, the sidebar MUST NOT render any module's in-module destinations, consistent with the
`module-hub` "Neutral Hub Rendering at `/`" requirement. The sidebar MAY render module-level
entries (equivalent to the hub grid) but MUST NOT render a module's nested destination list.

#### Scenario: Hub route at desktop shows no in-module destinations
- GIVEN a user is on `/` at a 1024px viewport
- WHEN the sidebar renders
- THEN it shows no module's in-module destination list, preserving hub neutrality

### Requirement: Quick-Create Is Mobile-Only (Known Limitation)

The quick-create affordance (`FabMenu`) MUST remain mobile-only. The sidebar MUST NOT provide a
quick-create control in this change; this is an accepted known limitation, not a defect.

#### Scenario: No quick-create control in the sidebar
- GIVEN the sidebar is visible at >=768px
- WHEN the sidebar's contents are inspected
- THEN no quick-create/FAB-equivalent control is present
