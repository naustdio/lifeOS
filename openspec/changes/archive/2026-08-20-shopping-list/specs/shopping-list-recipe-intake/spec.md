# Shopping List Recipe Intake Specification

## Purpose

Three entry points that turn recipe ingredients into shopping-list items — single-recipe button, multi-select, and weekly planner — all writing into the same continuous list, with portion scaling on add and quantity combining with a per-origin breakdown.

## Requirements

### Requirement: Single-Recipe Entry Point With Portion-Scaling Prompt

The recipe detail page MUST offer a "Generar lista de compras" action that prompts for a target portion count and scales each ingredient quantity using `quantity * (targetPortions / recipe.portions)`, the same formula used in `RecipeDetail.tsx`.

#### Scenario: Ingredients are scaled to the requested portions

- GIVEN a recipe has `portions = 4` and an ingredient with `quantity = 200`
- WHEN a household member generates a list for 8 portions
- THEN the resulting shopping-list item quantity is `400`

#### Scenario: Declining to change portions uses the recipe's default

- GIVEN a household member opens the portion prompt
- WHEN they confirm without changing the suggested value
- THEN the recipe's own `portions` value is used as the target and quantities are unscaled

### Requirement: Multi-Select Entry Point From Recipe List

The `/recetas` list MUST support selecting multiple recipes and generating shopping-list items for all of them in one action, each recipe scaled independently.

#### Scenario: Two recipes generate combined-eligible items in one action

- GIVEN a household member selects two recipes on `/recetas`
- WHEN they trigger "Generar lista de compras" for the selection
- THEN ingredient items from both recipes are added to the same active shopping list in a single operation

### Requirement: Weekly Planner Entry Point Is a Producer Only

The weekly planner MUST assign at most one recipe per day/meal slot and expose an "Agregar a mi lista" action per assignment that adds that recipe's ingredients to the shopping list; the planner MUST NOT persist any shopping-list state of its own beyond the slot assignment.

#### Scenario: Adding from the planner writes into the single list

- GIVEN a recipe is assigned to Monday's dinner slot in the weekly planner
- WHEN a household member taps "Agregar a mi lista" for that slot
- THEN the recipe's ingredients (scaled to its default portions unless a target is given) appear in the same continuous shopping list

#### Scenario: The planner does not create a second list

- GIVEN items have been added to the shopping list from the planner
- WHEN the household's shopping list is inspected
- THEN there is exactly one active list, and the planner itself holds no checkable item state

### Requirement: Quantity Combining With Origin Breakdown

When two or more added items share the same ingredient name and the same unit, the system MUST combine them into one list line showing the summed quantity, with a secondary sub-line listing each contributing origin (recipe title, or "manual" for loose items) and its contributed quantity. Items sharing a name but differing in unit MUST remain separate lines with no unit conversion.

#### Scenario: Same name and unit from two recipes combine

- GIVEN Recipe A contributes `300 g` of "Pollo" and Recipe B contributes `200 g` of "Pollo"
- WHEN both are added to the list
- THEN the list shows one line "500 g Pollo" with a sub-line reading "300 g de Recipe A + 200 g de Recipe B"

#### Scenario: Same name, different units stay separate

- GIVEN Recipe A contributes "200 g" of "Queso" and Recipe B contributes "1 taza" of "Queso"
- WHEN both are added to the list
- THEN the list shows two separate lines, one per unit, with no conversion between them

#### Scenario: A loose item combines with a recipe-origin item of the same name and unit

- GIVEN a household member manually adds "100 g" of "Pollo"
- WHEN a recipe also contributing "Pollo" in "g" is added
- THEN the two combine into one line whose origin sub-line includes "manual" as one contributor

## Key Learnings

1. Combining is scoped strictly to identical name + identical unit; anything else stays on separate lines with no conversion attempted.
2. The weekly planner is contractually a producer — it must never grow its own checkable/clearable item state.
