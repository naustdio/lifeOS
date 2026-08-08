# Module Hub Specification

## Purpose

Defines the neutral authenticated shell at `/`: a pure launcher grid for LifeOS modules, plus the
rule that each module owns its own nested nav. No module-specific chrome renders at the outer,
shared layer.

## Requirements

### Requirement: Neutral Hub Rendering at `/`
`/` MUST always render the module-card grid — regardless of session history or prior navigation.
The hub MUST NOT auto-redirect into a module and MUST NOT remember or restore a "last visited
module". `/` MUST NOT render `NavPill`, `FabMenu`, or `OverflowMenu`.

#### Scenario: Fresh session shows the hub grid
- GIVEN a user authenticates for the first time
- WHEN they land on `/`
- THEN the module-card grid renders with no bottom nav and no FAB

#### Scenario: Returning to `/` after visiting a module still shows the hub
- GIVEN a user previously navigated into `/finance`
- WHEN they navigate back to `/` (directly or via the header title)
- THEN `/` renders the module grid again, not a redirect into Finance

### Requirement: Static Module Cards
Each module card MUST render only an icon, a module name, and a link (`href`) to that module's
entry route. A card MUST NOT fetch or display per-module data (e.g., balances, due counts).

#### Scenario: Finance card renders without fetching Finance data
- GIVEN the hub renders the Finance card
- WHEN the card is inspected
- THEN it shows only an icon and the label "Finance" linking to `/finance`, with no Finance data
  query executed

### Requirement: Hardcoded Module Discovery
The hub's module list MUST come from a hardcoded array in source, not a dynamic/plugin registry.

#### Scenario: Adding a module requires only an array entry
- GIVEN a new module ships its own `(module)/layout.tsx`
- WHEN it is added to the hub
- THEN the only hub-side change is one new entry in the hardcoded module array

### Requirement: Neutral Outer Shell
`AppLayout` (the outer authenticated shell) MUST NOT render any module-specific nav element on any
route, including routes inside a module. It MUST provide only the auth guard, the `max-w-md`
container, and the header.

#### Scenario: A module route has no nav from the outer shell
- GIVEN a user is on `/movimientos`
- WHEN the outer `AppLayout` renders
- THEN it contributes no `NavPill`, `FabMenu`, or `OverflowMenu` — those come from the module's own
  nested layout

### Requirement: Title Links Back to the Hub
The "LifeOS" title text in `AppLayout`'s header MUST be a link to `/`, present on every
authenticated screen (hub and every module screen).

#### Scenario: Title navigates from a module screen back to the hub
- GIVEN a user is on `/cuentas`
- WHEN they activate the "LifeOS" header title
- THEN they land on `/`, and the hub grid renders

### Requirement: Finance Nested Layout Owns Finance Nav
`(finance)/layout.tsx` MUST render the same `NavPill`, `FabMenu`, and `OverflowMenu` JSX previously
owned by `AppLayout`, unchanged in behavior, for `/finance` and all six moved Finance routes.

#### Scenario: Finance nav renders unchanged inside the module
- GIVEN a user is on `/finance` or any of the six moved Finance routes
- WHEN the page renders
- THEN `NavPill`, `FabMenu`, and `OverflowMenu` render with the same behavior as before this change

### Requirement: `/finance` Serves the Former Dashboard
`/finance` MUST render the same dashboard content (month summary, spending-by-category, recent
movements) that previously rendered at `/`, unchanged except for its address.

#### Scenario: `/finance` shows the pre-change dashboard content
- GIVEN a household with posted transactions this month
- WHEN a user visits `/finance`
- THEN the same three dashboard cards render as previously rendered at `/`, with identical data and
  behavior

### Requirement: Finance Route Addresses Stay Byte-Identical
`/movimientos`, `/cuentas`, `/presupuestos`, `/recurrentes`, `/categorias`, and `/calendario` MUST
keep their exact pre-change URLs, request/response shapes, and Server Action behavior. Only their
file location under `(finance)/` changes.

#### Scenario: Moved routes resolve unchanged
- GIVEN the six Finance route folders now live under `src/app/(app)/(finance)/`
- WHEN a user visits any of the six URLs
- THEN each resolves at its unchanged address with unchanged behavior, and every pre-existing test
  for that route passes without modification to its assertions
