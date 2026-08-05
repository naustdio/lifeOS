# Finance Categories Specification

## Purpose

Defines the two-level income/expense category taxonomy, Spanish-language seeded defaults, and user customization (create, rename, deactivate).

## Requirements

### Requirement: Two-Level Taxonomy
A category MUST have `kind` of `income` or `expense`, and MAY have a `parent_id` referencing another category of the same `kind`. Nesting MUST be limited to a maximum of one level (a category with a `parent_id` MUST NOT itself be assigned as another category's parent).

#### Scenario: Subcategory of a subcategory is rejected
- GIVEN category B has `parent_id` pointing to category A
- WHEN a user attempts to create category C with `parent_id` pointing to category B
- THEN the creation is rejected

### Requirement: Seeded Spanish Defaults
On provisioning, the system MUST seed a default set of system categories (`is_system = true`, `household_id = null`) with names in Spanish (e.g., "Comida", "Transporte", "Salario"), covering common income and expense kinds.

#### Scenario: Default categories exist in Spanish after seed
- GIVEN the database seed has run
- WHEN system categories are queried
- THEN they have `is_system = true`, `household_id = null`, and Spanish names

### Requirement: User-Created Categories
A user MUST be able to create a custom category scoped to their own household, specifying name, kind, and optional parent.

#### Scenario: User creates a household-scoped category
- GIVEN a user creates a category named "Renta" of kind `expense`
- WHEN saved
- THEN the category has `household_id` set to the user's household and `is_system = false`, and is available only to that household's transactions

### Requirement: Rename Any Category
A user MUST be able to rename **any** category available to them — both categories they created and seeded default categories — without breaking references from existing transactions. A rename MUST affect only the renaming user's own space and MUST NOT change what any other space sees.

#### Scenario: Renaming a custom category preserves transaction links
- GIVEN a user renames their custom category "Renta" to "Alquiler"
- WHEN the rename is saved
- THEN existing transactions referencing that category's id still resolve correctly and display the new name

#### Scenario: Renaming a seeded default category
- GIVEN the seeded default category "Transporte" is available to a user
- WHEN the user renames it to "Auto y viajes"
- THEN the category displays as "Auto y viajes" for that user, existing transactions referencing it still resolve, and no other space's copy of that default is affected

### Requirement: Deactivate Categories Instead of Deleting
A user MUST be able to deactivate a category (their own custom category, or hide a system category from their household's selection) rather than deleting it, because transactions may reference it. A deactivated category MUST be excluded from selection in new transactions but MUST remain valid for existing transaction references.

#### Scenario: Deactivated category hidden from new-entry pickers
- GIVEN a category has been deactivated
- WHEN a user opens the category picker for a new transaction
- THEN the deactivated category does not appear in the list

#### Scenario: Deactivated category still resolves for historical transactions
- GIVEN a transaction references a category that has since been deactivated
- WHEN that transaction is displayed
- THEN the category name still renders correctly

## Resolved Ambiguities

**Renaming seeded default categories** — resolved by the user after this spec was first drafted: seeded defaults are renamable, not just deactivatable. The "Rename Any Category" requirement above reflects this.

### Design note (mechanism left to `sdd-design`)

The original draft modeled seeded defaults as globally shared rows (`is_system = true`, `household_id = null`). A globally shared row cannot be renamed per space, so the design must choose a mechanism that satisfies the requirement. Two viable options:

1. **Seed per space on creation** — when a space is bootstrapped, copy the default taxonomy into it as ordinary household-scoped rows. Rename and deactivate then need no special cases at all, at the cost of duplicated rows per space and a migration path when the default set changes.
2. **Global defaults plus a per-space override table** — keep shared default rows and store per-space name/visibility overrides. No duplication, but every read path must resolve overrides.

Option 1 is the simpler fit for a personal-first product with few spaces; `sdd-design` owns the final call and must justify it.
