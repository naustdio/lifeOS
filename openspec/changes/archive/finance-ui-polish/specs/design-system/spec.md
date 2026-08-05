# Delta for Design System

## ADDED Requirements

### Requirement: Shared Presentation Patterns
The system MUST provide reusable presentation components in `src/design-system/patterns/` — `TransactionRow`, `ProgressBar`, and `QuickActionRow` — and every Finance screen that renders a transaction row, a progress indicator, or a quick-action row MUST consume these shared components rather than duplicating equivalent markup inline.

#### Scenario: Transaction list reuses the shared row
- GIVEN Home, Cuentas, or Movimientos renders a list of transactions
- WHEN the list is inspected
- THEN each row is rendered via `TransactionRow`, not an ad hoc flex row or a standalone bordered `Card`

#### Scenario: Budget progress reuses the shared bar
- GIVEN Presupuestos renders a budget's progress
- WHEN the progress indicator is inspected
- THEN it is rendered via `ProgressBar`, not a one-off inline implementation

#### Scenario: No duplicated row/bar markup remains
- GIVEN all five Finance screens are inspected
- WHEN their source is searched for transaction-row or progress-bar markup
- THEN no screen defines its own competing implementation outside `design-system/patterns/`

### Requirement: Quick Action Row Contains Only Real Destinations
`QuickActionRow` MUST render only actions that link to an already-working destination. It MUST NOT include a disabled, placeholder, or dead-link button for a feature that does not yet exist.

#### Scenario: Only working actions are shown
- GIVEN `QuickActionRow` is rendered on the balance hero
- WHEN its actions are inspected
- THEN every action navigates to or triggers an existing, functional destination (e.g. new transaction, new account)

#### Scenario: Unbuilt feature is omitted, not disabled
- GIVEN a feature such as transfers has no working entry point yet
- WHEN `QuickActionRow` is rendered
- THEN no button for that feature is present, disabled or otherwise

### Requirement: Interaction States on Interactive Elements
Every interactive element in the base component set and the Finance screens MUST expose a visible hover state and a visible active state, transitioning via Tailwind-only CSS transitions of 150–250ms, consistent with the existing `FabMenu.tsx` `transition-transform hover:scale-105` precedent. The system MUST NOT use animation libraries or orchestrated/decorative animation sequences.

#### Scenario: Button shows hover and active feedback
- GIVEN a `button`, `card`, `chip`, or `nav-pill` component is rendered
- WHEN a pointer hovers over it and then activates it
- THEN a visible style change occurs for each state, transitioning within 150–250ms via a Tailwind utility class

#### Scenario: No orchestrated animation is introduced
- GIVEN any interactive element in this change
- WHEN its motion is inspected
- THEN it uses only Tailwind/CSS transition or transform utilities, with no animation library and no multi-step orchestrated sequence

### Requirement: Polished Empty States
Every Finance screen with a possible empty state — zero accounts, zero movements, or a 0%-progress budget — MUST render a polished, styled empty state built from design-system components, not the unstyled placeholder that predates this change.

#### Scenario: Zero accounts renders a styled empty state
- GIVEN a user has no accounts
- WHEN Cuentas is rendered
- THEN a styled empty state is shown, not a bare or unstyled placeholder

#### Scenario: Zero-progress budget renders a styled empty bar
- GIVEN a budget has 0% progress
- WHEN Presupuestos renders that budget
- THEN `ProgressBar` renders a polished zero-state, not an empty or broken bar

### Requirement: Light Mode as Primary Reviewed Theme
For this change, the light theme MUST be the primary design target reviewed for visual correctness, while the dark theme MUST still reach full token parity with the light theme and remain fully functional as the secondary reference.

#### Scenario: Light theme matches the design reference
- GIVEN the light theme is active
- WHEN any polished Finance screen is rendered
- THEN its layout, hierarchy, and token usage match the reviewed design reference

#### Scenario: Dark theme remains fully functional
- GIVEN the dark theme is active
- WHEN any polished Finance screen is rendered
- THEN every token used in the light theme has a corresponding dark-theme value and no element is left unstyled or using a light-only literal

### Requirement: Presentation-Only Change Boundary
This change MUST NOT alter `finance/api`, `domain`, or `data` layer behavior. Those layers MUST show zero diff as a result of this change.

#### Scenario: API layer is untouched
- GIVEN this change is applied
- WHEN `finance/api`, `domain`, and `data` are diffed against their pre-change state
- THEN no changes are present in any of those layers

### Requirement: No New Raw Token Values
This change MUST NOT introduce new raw color, radius, or shadow token values. All visual polish MUST be achieved by composing the existing token set defined in `primitives.css` and `semantic.css`.

#### Scenario: No new raw literal is added
- GIVEN the token files and component styles touched by this change are inspected
- WHEN searched for raw hex/RGB/px shadow literals not already present before the change
- THEN none are found; only existing tokens are composed or referenced
