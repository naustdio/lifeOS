# Delta for Module Hub

## MODIFIED Requirements

### Requirement: Neutral Outer Shell
`AppLayout` (the outer authenticated shell) MUST NOT render any module-specific nav element on any
route, including routes inside a module, except for the tablet/desktop sidebar defined by
`adaptive-navigation`, which the shell MAY mount because it is a shared cross-module surface, not
a module-specific one. Below the 768px (`md`) breakpoint, `AppLayout` MUST provide only the auth
guard, the `max-w-md` container with bottom padding reserved for `NavPill`, and the header — this
is unchanged. At 768px and above, `AppLayout` MUST provide the auth guard, the header, the sidebar
mount point, and the content container; the bottom padding reserved for `NavPill` MUST be dropped
at 768px and above since `NavPill` is not rendered there.
(Previously: shell was unconditionally `max-w-md` + bottom-pill padding + no nav, with no
breakpoint distinction.)

#### Scenario: A module route has no module-specific nav from the outer shell below 768px
- GIVEN a user is on `/movimientos` at a viewport narrower than 768px
- WHEN the outer `AppLayout` renders
- THEN it contributes no `NavPill`, `FabMenu`, or `OverflowMenu` — those come from the module's own
  nested layout

#### Scenario: Outer shell mounts the sidebar at 768px and above
- GIVEN a user is on `/movimientos` at a viewport of 768px or wider
- WHEN the outer `AppLayout` renders
- THEN it mounts the shared sidebar (scoped to the active module per `adaptive-navigation`), and
  still contributes no `FabMenu` or `OverflowMenu`

#### Scenario: Content container keeps max-w-md at every width
- GIVEN any authenticated route at any viewport width
- WHEN the content container renders
- THEN it keeps `max-w-md`; only the outer shell's nav chrome and container padding change by
  breakpoint, never the content column width

### Requirement: Finance Nested Layout Owns Finance Nav
`(finance)/layout.tsx` MUST render the same `NavPill`, `FabMenu`, and `OverflowMenu` JSX previously
owned by `AppLayout`, unchanged in behavior, for `/finance` and all six moved Finance routes, below
the 768px breakpoint. The route/icon/label data feeding this JSX MUST be sourced from the shared
nav-item registry defined by `adaptive-navigation` rather than an inline hardcoded array; the
rendered output and behavior MUST remain identical to before this change.
(Previously: JSX and its route data were both defined inline in `(finance)/layout.tsx`, with no
shared registry.)

#### Scenario: Finance nav renders unchanged inside the module below 768px
- GIVEN a user is on `/finance` or any of the six moved Finance routes, at a viewport narrower than
  768px
- WHEN the page renders
- THEN `NavPill`, `FabMenu`, and `OverflowMenu` render with the same behavior as before this change

#### Scenario: Finance nav data comes from the shared registry
- GIVEN `(finance)/layout.tsx` renders its mobile nav
- WHEN its route/icon/label data is inspected
- THEN it is read from the shared nav-item registry, and no hardcoded route array remains inline in
  the layout file
