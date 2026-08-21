# Shopping List Module API Specification

## Purpose

`src/modules/shopping-list/api` as the sole public entry point into the module, with cross-module composition (reading recipe data) confined to the `app` layer — never a direct `recipes` module import inside `shopping-list`.

## Requirements

### Requirement: Sole Public Barrel

External callers MUST interact with the shopping-list module only through `src/modules/shopping-list/api`; internal `domain`/`data` layers MUST NOT be imported directly from outside the module.

#### Scenario: App layer imports only the api barrel

- GIVEN a Server Action under the shopping-list route group needs shopping-list functionality
- WHEN its imports are inspected
- THEN it imports from `@/modules/shopping-list/api` and not from `@/modules/shopping-list/domain` or `@/modules/shopping-list/data` directly

### Requirement: No Direct Cross-Module Import From Recipes

The shopping-list module, at any layer, MUST NOT import `@/modules/recipes/api` or any other path under `@/modules/recipes`.

#### Scenario: Static check finds zero recipes imports inside shopping-list

- GIVEN the shopping-list module source tree
- WHEN `rg "@/modules/recipes/api" src/modules/shopping-list` is run
- THEN zero matches are returned

### Requirement: App-Layer Composition for Cross-Module Data

Composition of recipe data into shopping-list writes MUST happen in an `app`-layer Server Action that imports both `@/modules/shopping-list/api` and `@/modules/recipes/api` and passes plain data (not live module objects) between them.

#### Scenario: A Server Action composes both modules with plain data

- GIVEN a household member generates a shopping list from a recipe
- WHEN the Server Action executes
- THEN it reads recipe ingredient data via `@/modules/recipes/api`, then calls `@/modules/shopping-list/api` passing plain ingredient values (name, quantity, unit, cost) as arguments, never a recipes-module class or live object

### Requirement: No ESLint Boundary Carve-Out

The change MUST NOT add any shopping-list-specific exception to `eslint.config.mjs`'s `boundaries/element-types` rule.

#### Scenario: ESLint config is unchanged

- GIVEN the full diff for this change
- WHEN `eslint.config.mjs` is inspected
- THEN no shopping-list-specific rule or carve-out has been added

## Key Learnings

1. The module boundary is enforced both structurally (existing ESLint Gate A, no carve-out) and behaviorally (a static grep scenario for zero cross-module imports).
2. Composition happens exclusively at the app layer via plain-data arguments, never a live module object crossing the boundary.
