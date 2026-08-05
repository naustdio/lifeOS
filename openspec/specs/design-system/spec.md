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

## Resolved Ambiguities

**Theme selection mechanism** — resolved by the user after this spec was first drafted: the theme follows the operating system preference by default **and** offers a persisted manual override. Captured above as the "Theme Selection" requirement; no longer open for `sdd-design` to decide.
