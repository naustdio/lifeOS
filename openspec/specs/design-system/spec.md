# Design System Specification

## Purpose

Defines the token-driven design system (color, typography, spacing, radius, shadow) that backs light and dark themes and a base component set, so no component ever hardcodes a raw color value.

## Requirements

### Requirement: Token Definitions
The system MUST define design tokens for color (including brand accent lime `#C6F432` family, contrast accent near-black `#111` family, semantic income/expense colors, and surface colors), typography scale, spacing scale, corner radius, and shadow/elevation, each with a light-theme value and a dark-theme value.

#### Scenario: Token has both theme values
- GIVEN the token set is defined
- WHEN any color token is inspected
- THEN it resolves to a distinct value under the light theme and under the dark theme

### Requirement: No Raw Hex in Components
Component code MUST NOT reference raw hex/RGB color literals; components MUST consume only design tokens.

#### Scenario: Component renders via tokens only
- GIVEN a base component (button, card, nav pill, FAB, chip) is rendered
- WHEN its computed styles are inspected
- THEN every color value traces back to a design token, not a literal hex value

### Requirement: Dual Theme Support
The application MUST render correctly in both a light theme and a dark theme, both available from initial release (no theme added later as a retrofit).

#### Scenario: Dark theme renders with dark tokens
- GIVEN the dark theme is active
- WHEN any screen renders
- THEN surfaces use the dark-theme token values (near-black page, elevated dark-gray cards) and the same lime accent as light theme

#### Scenario: Semantic amount colors remain consistent across themes
- GIVEN a transaction amount is displayed
- WHEN the theme is light or dark
- THEN income amounts render in the green semantic token and expense amounts render in the red semantic token, never as the brand accent color

### Requirement: Base Component Set
The system MUST provide a themed base component set (buttons, cards, nav pill, floating action button, chips, form inputs) built on the retokenized component library, using pill-shaped buttons/chips/nav and 20-24px card radius per the design direction.

#### Scenario: Base button uses design-direction radius and shape
- GIVEN a primary button component is rendered
- WHEN its shape is inspected
- THEN it uses a full-pill border radius per the design direction

### Requirement: Theme Selection
The application MUST initialize its theme from the operating system's color-scheme preference, and MUST also provide an explicit user override (light or dark) that persists across sessions and takes precedence over the system preference until the user returns to the system-following option.

#### Scenario: First visit follows system preference
- GIVEN a user has never set a theme override
- WHEN the application loads and the operating system reports a dark color-scheme preference
- THEN the dark theme is applied

#### Scenario: Manual override wins over system preference
- GIVEN the operating system reports a dark color-scheme preference
- WHEN the user selects the light theme override
- THEN the light theme is applied and remains applied on the next session

#### Scenario: Returning to system-following clears the override
- GIVEN the user has an explicit theme override stored
- WHEN the user selects the system-following option
- THEN the stored override is cleared and the theme again tracks the operating system preference

### Requirement: Mobile-First Layout
Every screen built from the design system MUST remain usable at a 375px viewport width, with desktop layouts as a responsive enhancement rather than a separate design pass.

#### Scenario: Screen usable at minimum supported width
- GIVEN a screen built with base components
- WHEN the viewport is 375px wide
- THEN all interactive elements are reachable and legible without horizontal scrolling

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
Every Finance screen with a possible empty state — zero accounts, zero movements, or a 0%-progress budget — MUST render a polished, styled empty state built from design-system components, not an unstyled placeholder.

#### Scenario: Zero accounts renders a styled empty state
- GIVEN a user has no accounts
- WHEN Cuentas is rendered
- THEN a styled empty state is shown, not a bare or unstyled placeholder

#### Scenario: Zero-progress budget renders a styled empty bar
- GIVEN a budget has 0% progress
- WHEN Presupuestos renders that budget
- THEN `ProgressBar` renders a polished zero-state, not an empty or broken bar

### Requirement: Light Mode as Primary Reviewed Theme
The light theme MUST be the primary design target reviewed for visual correctness, while the dark theme MUST still reach full token parity with the light theme and remain fully functional as the secondary reference.

#### Scenario: Light theme matches the design reference
- GIVEN the light theme is active
- WHEN any polished Finance screen is rendered
- THEN its layout, hierarchy, and token usage match the reviewed design reference

#### Scenario: Dark theme remains fully functional
- GIVEN the dark theme is active
- WHEN any polished Finance screen is rendered
- THEN every token used in the light theme has a corresponding dark-theme value and no element is left unstyled or using a light-only literal

### Requirement: No New Raw Token Values for Presentation Polish
Presentation-layer polish work MUST NOT introduce new raw color, radius, or shadow token values. All visual polish MUST be achieved by composing the existing token set defined in `primitives.css` and `semantic.css`.

#### Scenario: No new raw literal is added
- GIVEN the token files and component styles touched by a polish change are inspected
- WHEN searched for raw hex/RGB/px shadow literals not already present before the change
- THEN none are found; only existing tokens are composed or referenced

### Requirement: Styled Select Component for Every Dropdown
The system MUST provide a retokenized `Select` component (`src/design-system/ui/select.tsx`) that every dropdown/select field in the application uses. A raw, unstyled native `<select>` MUST NOT be used for any new or modified form field.

#### Scenario: Form dropdown uses the shared Select component
- GIVEN a form field needs a dropdown of options
- WHEN the field is implemented
- THEN it uses `design-system/ui/select.tsx`'s `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, not a raw `<select>`/`<option>` pair

#### Scenario: Select still participates in Server Action form submission
- GIVEN a `Select` is rendered inside a `<form action={serverAction}>` with a `name` prop
- WHEN the form is submitted
- THEN the selected value is present in the submitted `FormData` under that `name`, identical to a native `<select>`

### Requirement: Overflow ("Más") Navigation Entry Point
The app shell MUST provide a 5th nav-pill slot labeled "Más" that opens an overflow menu, so secondary screens are reachable without a fixed 4-slot pill redesign. `Presupuestos` and `Recurrentes` MUST both be reachable through this overflow menu.

#### Scenario: Más opens an overflow menu
- GIVEN the app shell nav pill is rendered
- WHEN the user activates the "Más" slot
- THEN an overflow menu opens listing secondary destinations

#### Scenario: Presupuestos and Recurrentes are reachable via Más at 375px
- GIVEN the viewport is 375px wide, in either light or dark theme
- WHEN the user opens the "Más" menu
- THEN both `Presupuestos` and `Recurrentes` are visible, legible, and reachable entries in that menu

#### Scenario: Direct nav slots are unchanged for primary destinations
- GIVEN the app shell nav pill is rendered
- WHEN the 4 primary slots are inspected
- THEN they retain their existing direct destinations, and only `Presupuestos` moves into the overflow menu

## Resolved Ambiguities

**Theme selection mechanism** — resolved by the user after this spec was first drafted: the theme follows the operating system preference by default **and** offers a persisted manual override. Captured above as the "Theme Selection" requirement; no longer open for `sdd-design` to decide.
