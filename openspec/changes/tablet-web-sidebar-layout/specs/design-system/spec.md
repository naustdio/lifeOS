# Delta for Design System

## ADDED Requirements

### Requirement: Sidebar Presentation Primitive

The system MUST provide a themed sidebar primitive in `src/design-system/ui/` (dumb, data-injected,
no route data) that renders a vertical list of navigation destinations with active-route
highlighting, built on design tokens per the existing "No Raw Hex in Components" and "Token
Definitions" requirements.

#### Scenario: Sidebar item highlights the active route
- GIVEN the sidebar renders a list of destinations and one matches the current route
- WHEN the active destination is inspected
- THEN it is visually distinguished from inactive destinations using design tokens, and exposes
  `aria-current="page"`

#### Scenario: Sidebar primitive holds no route data
- GIVEN `src/design-system/ui/sidebar.tsx` is inspected
- WHEN searched for hardcoded routes, module names, or nav-item arrays
- THEN none are found; all navigation data is received via props

## MODIFIED Requirements

### Requirement: Mobile-First Layout
Every screen built from the design system MUST remain usable at a 375px viewport width, with
desktop layouts as a responsive enhancement rather than a separate design pass. At 768px (`md`) and
above, the `(app)` shell's navigation chrome MUST enhance to a persistent sidebar in place of the
mobile bottom nav, without altering page-content layout (page content keeps its existing
composition and width at every breakpoint).
(Previously: mobile-first usability requirement with no explicit statement of what the desktop
enhancement consists of.)

#### Scenario: Screen usable at minimum supported width
- GIVEN a screen built with base components
- WHEN the viewport is 375px wide
- THEN all interactive elements are reachable and legible without horizontal scrolling

#### Scenario: Desktop enhancement is navigation chrome only
- GIVEN a screen built with base components is inspected at 375px and again at 1024px
- WHEN the two renders are compared
- THEN the page-content composition and width are unchanged, and the only structural difference is
  the navigation surface (bottom pill vs. sidebar)
