# Delta for Design System

## ADDED Requirements

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
