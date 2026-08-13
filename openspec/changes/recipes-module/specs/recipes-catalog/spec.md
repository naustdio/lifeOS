# Recipes Catalog Specification

## Purpose

A household-shared recipe record — title, category, portions, ordered ingredients, and ordered numbered steps — searchable by name and filterable by category, with no visibility/private split.

## Requirements

### Requirement: Recipe Core Record

The system MUST represent a recipe as one row with `title`, a fixed-enum `category` (Desayuno, Comida, Cena, Postre, Snack), and an integer `portions` value that is informational display only (no quantity recalculation).

#### Scenario: A recipe is created with core fields

- GIVEN a household member fills title, category, and portions
- WHEN they submit the recipe
- THEN a recipe row is persisted with those three values

#### Scenario: Category is restricted to the fixed enum

- GIVEN a household member is creating or editing a recipe
- WHEN they select a category
- THEN only Desayuno, Comida, Cena, Postre, or Snack are offered, and any other value is rejected at write time

### Requirement: Ordered Ingredients as Relational Children

Each recipe MUST have zero or more ingredient rows (`name`, `quantity`, `unit`, `position`) linked by recipe ID, independently reorderable via the `position` column.

#### Scenario: Ingredients are saved in entry order

- GIVEN a household member adds three ingredients in a specific order
- WHEN the recipe is saved
- THEN the three ingredient rows persist with `position` values reflecting that order

#### Scenario: Ingredients can be reordered without affecting steps

- GIVEN a saved recipe has ingredients and steps
- WHEN a household member reorders the ingredients
- THEN only ingredient `position` values change and step order is unaffected

### Requirement: Ordered Numbered Steps as Relational Children

Each recipe MUST have zero or more step rows (`position`, `instruction`) linked by recipe ID, rendered as a numbered sequence.

#### Scenario: Steps render in numeric sequence

- GIVEN a saved recipe has four steps
- WHEN the recipe detail is viewed
- THEN the steps render numbered 1 through 4 in `position` order

### Requirement: Unit Input Uses a Persisted Picklist with Free-Text Fallback

Ingredient `unit` MUST be selectable from the fixed picklist `g, kg, ml, l, taza, cucharada, cucharadita, pieza, pizca, oz, lb, diente, manojo, al gusto`, OR entered as free text when no picklist value fits. A free-text unit MUST be persisted per household and offered in that household's picklist for future recipes.

#### Scenario: A free-text unit is offered on the next recipe

- GIVEN a household member types a unit not in the fixed picklist while saving a recipe
- WHEN they later create another recipe
- THEN the previously typed unit appears as a selectable option for that household

#### Scenario: Free-text units do not leak across households

- GIVEN household A has previously typed a custom unit
- WHEN a member of household B creates a recipe
- THEN household A's custom unit is not offered to household B

### Requirement: Household-Shared Visibility

Every recipe MUST be visible to all members of its owning household via `core.is_member(household_id)`; the system MUST NOT implement any per-recipe private or visibility mechanism.

#### Scenario: All household members see the same recipe

- GIVEN a recipe was created by one household member
- WHEN a different member of the same household opens the recipe list
- THEN the recipe appears for them identically

#### Scenario: A non-member cannot see the recipe

- GIVEN a recipe belongs to household A
- WHEN a member of household B queries recipes
- THEN household A's recipe is not returned

### Requirement: Name Search and Category Filter

The system MUST support filtering the recipe list by recipe name (substring match) and by category, usable together, on both mobile and desktop viewports.

#### Scenario: Searching by partial name returns matches

- GIVEN a household has recipes titled "Tacos al pastor" and "Pastel de chocolate"
- WHEN a member searches "pastor"
- THEN only "Tacos al pastor" is returned

#### Scenario: Category filter narrows the list

- GIVEN a household has recipes across multiple categories
- WHEN a member filters by "Postre"
- THEN only recipes with category Postre are returned

#### Scenario: Search and filter compose on small viewports

- GIVEN a household member is on a small-viewport (mobile) screen
- WHEN they apply both a name search term and a category filter
- THEN the list reflects both constraints simultaneously without layout breakage

## Key Learnings

1. Ingredients and steps are independent ordered child tables, so reordering one never perturbs the other's `position` sequence.
2. Free-text units are scoped per household, not global, to avoid one household's ad-hoc vocabulary leaking into another's picklist.
