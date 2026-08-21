# Shopping List Store Types Specification

## Purpose

An open, household-scoped, user-extensible store-type taxonomy — shaped like `recipes.custom_units` — used to group shopping-list items in the UI, seeded with a base set but never a fixed enum.

## Requirements

### Requirement: Open, Household-Scoped Store-Type Taxonomy

Store types MUST be stored per household as an open, extensible list (not a fixed enum), and any household member MUST be able to create a new store type beyond the base set.

#### Scenario: A member creates a custom store type

- GIVEN a household's store types include only the base set
- WHEN a household member creates a new store type named "Panadería"
- THEN "Panadería" is persisted for that household and becomes selectable for grouping items

#### Scenario: Custom store types do not leak across households

- GIVEN household A has created a custom store type
- WHEN a member of household B views available store types
- THEN household A's custom store type is not offered to household B

### Requirement: Base Store-Type Set

Every household MUST have the base set available without needing to create it manually: Supermercado, Carnicería, Cremería, and "Mercado y Frutas y Verduras".

#### Scenario: A new household sees the base set

- GIVEN a household has never created a custom store type
- WHEN a member views store-type grouping options
- THEN Supermercado, Carnicería, Cremería, and "Mercado y Frutas y Verduras" are all available

### Requirement: Items Grouped by Store Type in the UI

The shopping list UI MUST render items grouped under their store-type header; items without an assigned store type MUST render under a distinct "Sin categoría" (or equivalent) group rather than being hidden.

#### Scenario: Items render under their store-type header

- GIVEN a list has items assigned to "Carnicería" and to "Cremería"
- WHEN the list is viewed
- THEN items appear grouped under each respective store-type header

#### Scenario: Unassigned items are not hidden

- GIVEN an item has no store type assigned
- WHEN the list is viewed
- THEN the item still appears, grouped under an "unassigned" group rather than omitted

## Key Learnings

1. The taxonomy must never be a fixed enum — it mirrors `recipes.custom_units` in being open and household-scoped.
2. Grouping must be non-lossy: an item with no store type still renders, under an explicit unassigned group.
